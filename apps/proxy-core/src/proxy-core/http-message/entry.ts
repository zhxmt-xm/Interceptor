import { MIMEType } from 'node:util';

import { encodeBuffer, type SUPPORTED_ENCODING } from 'http-encoding';
import * as iconv from 'iconv-lite';

import type {
  HttpBodyReplacementInput,
  HttpBodySource,
  HttpMessageHeaders,
  PreparedHttpBodyReplacement,
} from './interfaces';
import { HttpBodyEncodingError } from './internal/errors';

/**
 * 按最终 HTTP headers 构造 replacement content bytes；transfer framing 留给发送层。
 */
export class HttpMessageService {
  /** 判断错误是否由 replacement charset/content coding 构造失败产生。 */
  isEncodingError(error: unknown): error is HttpBodyEncodingError {
    return error instanceof HttpBodyEncodingError;
  }

  /** 构造 content bytes，并按编辑意图维护继承的 Content-Length。 */
  async prepareReplacement(
    input: HttpBodyReplacementInput,
  ): Promise<PreparedHttpBodyReplacement> {
    const headers = this.cloneHeaders(input.headers);
    const content = await this.buildContent(input.body, input.source, headers);
    if (
      !input.editedHeaderNames.has('content-length')
      && this.hasHeader(input.originalHeaders, 'content-length')
    ) {
      this.setHeader(headers, 'content-length', String(content.byteLength));
    }
    return { content, headers };
  }

  /** 把 Text/File 转成 charset 与 Content-Encoding 均已应用的 content bytes。 */
  async buildContent(
    body: string | Uint8Array,
    source: HttpBodySource,
    headers: HttpMessageHeaders,
  ): Promise<Uint8Array> {
    let content = this.sourceBytes(body, source, headers);
    for (const encoding of this.contentEncodings(headers)) {
      try {
        content = new Uint8Array(await encodeBuffer(content, encoding, { level: 1 }));
      } catch (error) {
        throw new HttpBodyEncodingError(
          `Failed to apply Content-Encoding "${encoding}".`,
          { cause: error },
        );
      }
    }
    return content;
  }

  /** 根据 replacement 来源生成 content coding 前的正文 bytes。 */
  private sourceBytes(
    body: string | Uint8Array,
    source: HttpBodySource,
    headers: HttpMessageHeaders,
  ): Uint8Array {
    if (source === 'file') {
      if (typeof body === 'string') {
        throw new HttpBodyEncodingError('File replacement must provide bytes.');
      }
      return new Uint8Array(body);
    }
    if (typeof body !== 'string') {
      throw new HttpBodyEncodingError('Text replacement must provide a string.');
    }
    const charset = this.textCharset(headers);
    if (!iconv.encodingExists(charset)) {
      throw new HttpBodyEncodingError(`Unsupported text charset "${charset}".`);
    }
    return new Uint8Array(iconv.encode(body, charset));
  }

  /** 读取 Text replacement 的明确 charset；缺失时使用 UTF-8。 */
  private textCharset(headers: HttpMessageHeaders): string {
    const contentTypes = this.headerValues(headers, 'content-type');
    if (contentTypes.length === 0) {
      return 'utf-8';
    }
    if (contentTypes.length > 1) {
      throw new HttpBodyEncodingError('Text replacement has multiple Content-Type values.');
    }
    const contentType = contentTypes[0]!;
    if (!/(?:^|;)\s*charset\s*=/i.test(contentType)) {
      return 'utf-8';
    }
    try {
      const charset = new MIMEType(contentType).params.get('charset')?.trim();
      if (!charset) {
        throw new HttpBodyEncodingError('Content-Type charset is empty.');
      }
      return charset;
    } catch (error) {
      if (error instanceof HttpBodyEncodingError) {
        throw error;
      }
      throw new HttpBodyEncodingError(
        `Invalid Content-Type for text replacement: "${contentType}".`,
        { cause: error },
      );
    }
  }

  /** 按 header 顺序展开并校验 Content-Encoding 列表。 */
  private contentEncodings(headers: HttpMessageHeaders): SUPPORTED_ENCODING[] {
    const encodings: SUPPORTED_ENCODING[] = [];
    for (const headerValue of this.headerValues(headers, 'content-encoding')) {
      for (const token of headerValue.split(',')) {
        const encoding = token.trim().toLowerCase();
        if (encoding === '') {
          throw new HttpBodyEncodingError('Content-Encoding contains an empty value.');
        }
        encodings.push(this.supportedContentEncoding(encoding));
      }
    }
    return encodings;
  }

  /** 将外部 Content-Encoding token 收窄为编码库支持的值。 */
  private supportedContentEncoding(encoding: string): SUPPORTED_ENCODING {
    switch (encoding) {
      case 'identity':
      case 'gzip':
      case 'x-gzip':
      case 'deflate':
      case 'x-deflate':
      case 'br':
      case 'zstd':
      case 'base64':
        return encoding;
      default:
        throw new HttpBodyEncodingError(`Unsupported Content-Encoding "${encoding}".`);
    }
  }

  /** 大小写不敏感读取一个 header 的全部有序值。 */
  private headerValues(headers: HttpMessageHeaders, name: string): string[] {
    const normalizedName = name.toLowerCase();
    const values: string[] = [];
    for (const [headerName, value] of Object.entries(headers)) {
      if (headerName.toLowerCase() !== normalizedName || value === undefined) {
        continue;
      }
      values.push(...(Array.isArray(value) ? value : [value]));
    }
    return values;
  }

  /** 判断原消息是否实际带有指定 header。 */
  private hasHeader(headers: HttpMessageHeaders, name: string): boolean {
    const normalizedName = name.toLowerCase();
    return Object.entries(headers).some(
      ([headerName, value]) =>
        headerName.toLowerCase() === normalizedName && value !== undefined,
    );
  }

  /** 保留首个原始大小写并替换全部同名 header。 */
  private setHeader(
    headers: HttpMessageHeaders,
    name: string,
    value: string,
  ): void {
    const normalizedName = name.toLowerCase();
    const keys = Object.keys(headers).filter(
      (headerName) => headerName.toLowerCase() === normalizedName,
    );
    const targetName = keys[0] ?? name;
    for (const key of keys) {
      delete headers[key];
    }
    headers[targetName] = value;
  }

  /** 深复制 header 数组，避免正文构造修改调用方输入。 */
  private cloneHeaders(headers: HttpMessageHeaders): HttpMessageHeaders {
    return Object.fromEntries(
      Object.entries(headers).map(([name, value]) => [
        name,
        Array.isArray(value) ? [...value] : value,
      ]),
    );
  }
}
