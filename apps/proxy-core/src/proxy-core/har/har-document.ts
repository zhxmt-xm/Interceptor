import type { CaptureHeader } from '@interceptor/core-protocol';

import { MAX_BODY_BYTES } from '../constants';
import {
  MAX_HAR_DOCUMENT_BYTES,
  MAX_HAR_ENTRIES,
  MAX_HAR_HEADER_NAME_LENGTH,
  MAX_HAR_HEADER_VALUE_LENGTH,
  MAX_HAR_HEADERS,
  MAX_HAR_URL_LENGTH,
} from './har-constants';
import type {
  ParsedHarDocument,
  ParsedHarEntry,
} from './interfaces';
import { InvalidHarError } from './har-invalid-error';

/** 将不可信 HAR JSON 解析为有限 Core 输入；未知扩展字段仅作为数据忽略。 */
export class HarDocumentParser {
  /** 校验文档上限、HAR 版本和 entry 数量后解析全部记录。 */
  static parse(source: string | Buffer): ParsedHarDocument {
    const bytes = Buffer.byteLength(source);
    if (bytes > MAX_HAR_DOCUMENT_BYTES) {
      throw new InvalidHarError(
        `HAR document exceeds ${MAX_HAR_DOCUMENT_BYTES} bytes.`,
      );
    }

    let root: unknown;
    try {
      root = JSON.parse(source.toString());
    } catch {
      throw new InvalidHarError('HAR document is not valid JSON.');
    }

    const log = this.requireRecord(
      this.requireRecord(root, 'HAR document').log,
      'log',
    );
    if (log.version !== '1.2') {
      throw new InvalidHarError('log.version must be "1.2".');
    }
    if (!Array.isArray(log.entries)) {
      throw new InvalidHarError('log.entries must be an array.');
    }
    if (log.entries.length > MAX_HAR_ENTRIES) {
      throw new InvalidHarError(
        `log.entries must contain at most ${MAX_HAR_ENTRIES} entries.`,
      );
    }

    return {
      creator: this.readCreator(log.creator),
      entries: log.entries.map((entry, index) =>
        this.parseEntry(entry, index)),
    };
  }

  /** 将一条标准 HAR entry 映射为可持久化的有限记录。 */
  private static parseEntry(value: unknown, index: number): ParsedHarEntry {
    const name = `log.entries[${index}]`;
    const entry = this.requireRecord(value, name);
    const request = this.requireRecord(entry.request, `${name}.request`);
    const response = this.requireRecord(entry.response, `${name}.response`);
    const startedDateTime = this.requireString(
      entry.startedDateTime,
      `${name}.startedDateTime`,
      128,
    );
    const startedAt = Date.parse(startedDateTime);
    if (!Number.isSafeInteger(startedAt) || startedAt < 0) {
      throw new InvalidHarError(`${name}.startedDateTime is invalid.`);
    }

    const durationMs = this.requireNonNegativeNumber(entry.time, `${name}.time`);
    const method = this.requireString(request.method, `${name}.request.method`, 32);
    const url = this.requireString(
      request.url,
      `${name}.request.url`,
      MAX_HAR_URL_LENGTH,
    );
    this.assertNetworkUrl(url, `${name}.request.url`);
    const requestHeaders = this.readHeaders(
      request.headers,
      `${name}.request.headers`,
    );
    const responseHeaders = this.readHeaders(
      response.headers,
      `${name}.response.headers`,
    );
    const status = this.requireInteger(
      response.status,
      `${name}.response.status`,
      0,
      599,
    );
    const statusText = this.optionalString(
      response.statusText,
      `${name}.response.statusText`,
      1_024,
    );
    const requestPostData = this.optionalRecord(
      request.postData,
      `${name}.request.postData`,
    );
    const responseContent = this.requireRecord(
      response.content,
      `${name}.response.content`,
    );
    const requestMime = requestPostData
      ? this.optionalString(
          requestPostData.mimeType,
          `${name}.request.postData.mimeType`,
          256,
        )
      : this.headerValue(requestHeaders, 'content-type');
    const responseMime = this.optionalString(
      responseContent.mimeType,
      `${name}.response.content.mimeType`,
      256,
    ) ?? this.headerValue(responseHeaders, 'content-type');
    const requestBody = requestPostData
      ? this.readBodyText(
          requestPostData,
          `${name}.request.postData`,
          '_encoding',
        )
      : undefined;
    const responseBody = this.readBodyText(
      responseContent,
      `${name}.response.content`,
      'encoding',
    );

    return {
      startedAt,
      durationMs,
      method,
      url,
      protocol: this.toProtocol(
        this.requireString(
          request.httpVersion,
          `${name}.request.httpVersion`,
          32,
        ),
      ),
      ...(status > 0 ? { statusCode: status } : {}),
      ...(statusText ? { statusText } : {}),
      requestHeaders,
      responseHeaders,
      ...(requestMime ? { requestMime } : {}),
      ...(responseMime ? { responseMime } : {}),
      ...(requestBody ? { requestBody } : {}),
      ...(responseBody ? { responseBody } : {}),
    };
  }

  /** 读取可选 creator；缺失时产生稳定占位元数据。 */
  private static readCreator(value: unknown): ParsedHarDocument['creator'] {
    const creator = this.optionalRecord(value, 'log.creator');
    if (!creator) {
      return { name: 'Unknown HAR producer', version: 'unknown' };
    }
    return {
      name: this.optionalString(creator.name, 'log.creator.name', 256) ??
        'Unknown HAR producer',
      version: this.optionalString(creator.version, 'log.creator.version', 128) ??
        'unknown',
    };
  }

  /** 校验 header 数量和名值上限，并保持原始顺序。 */
  private static readHeaders(value: unknown, name: string): CaptureHeader[] {
    if (!Array.isArray(value)) {
      throw new InvalidHarError(`${name} must be an array.`);
    }
    if (value.length > MAX_HAR_HEADERS) {
      throw new InvalidHarError(
        `${name} must contain at most ${MAX_HAR_HEADERS} headers.`,
      );
    }
    return value.map((item, index) => {
      const header = this.requireRecord(item, `${name}[${index}]`);
      return {
        name: this.requireString(
          header.name,
          `${name}[${index}].name`,
          MAX_HAR_HEADER_NAME_LENGTH,
        ),
        value: this.requireString(
          header.value,
          `${name}[${index}].value`,
          MAX_HAR_HEADER_VALUE_LENGTH,
          true,
        ),
      };
    });
  }

  /** 读取文本或严格 base64 正文，且在解码后再次执行字节上限。 */
  private static readBodyText(
    value: Record<string, unknown>,
    name: string,
    encodingKey: 'encoding' | '_encoding',
  ): Buffer | undefined {
    if (value.text === undefined) {
      return undefined;
    }
    const text = this.requireString(
      value.text,
      `${name}.text`,
      MAX_BODY_BYTES * 2,
      true,
    );
    const encoding = this.optionalString(
      value[encodingKey],
      `${name}.${encodingKey}`,
      32,
    );
    if (encoding !== undefined && encoding !== 'base64') {
      throw new InvalidHarError(`${name}.${encodingKey} must be "base64".`);
    }
    const body = encoding === 'base64'
      ? this.decodeBase64(text, `${name}.text`)
      : Buffer.from(text, 'utf8');
    if (body.byteLength > MAX_BODY_BYTES) {
      throw new InvalidHarError(`${name}.text exceeds ${MAX_BODY_BYTES} bytes.`);
    }
    return body;
  }

  /** 严格校验 base64 语法后解码，拒绝 Node 的宽松容错输入。 */
  private static decodeBase64(value: string, name: string): Buffer {
    const compact = value.replace(/\s/g, '');
    if (
      compact.length % 4 !== 0 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
        compact,
      )
    ) {
      throw new InvalidHarError(`${name} is not valid base64.`);
    }
    return Buffer.from(compact, 'base64');
  }

  /** 将 HAR httpVersion 归一化为 Capture 使用的协议标识。 */
  private static toProtocol(httpVersion: string): string {
    const normalized = httpVersion.toLowerCase();
    if (normalized.includes('3')) {
      return 'h3';
    }
    if (normalized.includes('2')) {
      return 'h2';
    }
    return 'h1';
  }

  /** 只允许可捕获的网络 URL scheme，拒绝 file/javascript/data 等输入。 */
  private static assertNetworkUrl(value: string, name: string): void {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw new InvalidHarError(`${name} is not a valid URL.`);
    }
    if (!['http:', 'https:', 'ws:', 'wss:'].includes(parsed.protocol)) {
      throw new InvalidHarError(`${name} must use http, https, ws, or wss.`);
    }
  }

  /** 按大小写不敏感名称查找首个 header 值。 */
  private static headerValue(
    headers: readonly CaptureHeader[],
    name: string,
  ): string | undefined {
    return headers.find((header) => header.name.toLowerCase() === name)?.value;
  }

  /** 要求输入为非数组对象。 */
  private static requireRecord(
    value: unknown,
    name: string,
  ): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new InvalidHarError(`${name} must be an object.`);
    }
    return value as Record<string, unknown>;
  }

  /** 读取可选对象；字段存在时复用严格对象校验。 */
  private static optionalRecord(
    value: unknown,
    name: string,
  ): Record<string, unknown> | undefined {
    return value === undefined ? undefined : this.requireRecord(value, name);
  }

  /** 要求字符串满足空值策略与字符上限。 */
  private static requireString(
    value: unknown,
    name: string,
    maxLength: number,
    allowEmpty = false,
  ): string {
    if (
      typeof value !== 'string' ||
      (!allowEmpty && value.length === 0) ||
      value.length > maxLength
    ) {
      throw new InvalidHarError(
        `${name} must be ${allowEmpty ? '' : 'a non-empty '}string no longer than ${maxLength} characters.`,
      );
    }
    return value;
  }

  /** 读取可选字符串；存在时允许空字符串但执行长度上限。 */
  private static optionalString(
    value: unknown,
    name: string,
    maxLength: number,
  ): string | undefined {
    return value === undefined
      ? undefined
      : this.requireString(value, name, maxLength, true);
  }

  /** 要求值为有限非负数。 */
  private static requireNonNegativeNumber(value: unknown, name: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      throw new InvalidHarError(`${name} must be a non-negative number.`);
    }
    return value;
  }

  /** 要求值为指定闭区间内的整数。 */
  private static requireInteger(
    value: unknown,
    name: string,
    minimum: number,
    maximum: number,
  ): number {
    if (
      typeof value !== 'number' ||
      !Number.isInteger(value) ||
      value < minimum ||
      value > maximum
    ) {
      throw new InvalidHarError(
        `${name} must be an integer from ${minimum} to ${maximum}.`,
      );
    }
    return value;
  }
}