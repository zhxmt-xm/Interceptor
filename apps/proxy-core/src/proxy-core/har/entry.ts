import { randomUUID } from 'node:crypto';
import { open, readFile, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';

import type {
  CaptureBodyRef,
  CaptureExchangeDetail,
  TransferJobSnapshot,
} from '@interceptor/core-protocol';

import { appVersion } from '../constants';
import { decodeBody } from '../proxy/utils';
import type { CaptureService } from '../capture/entry';
import type { ExchangeInput } from '../capture/interfaces';
import {
  HAR_BODY_READ_CHUNK_BYTES,
  HAR_EXPORT_PAGE_SIZE,
  HAR_IMPORT_BATCH_SIZE,
} from './internal/constants';
import { DocumentParser } from './internal/document';
import type {
  HarExportOptions,
  HarExportScope,
  HarProgressListener,
  HarRedactionOptions,
  HarTransferResult,
  ParsedHarEntry,
} from './interfaces';
import { InvalidHarError } from './internal/errors';
import { TransferService } from '../transfer/entry';
import * as HarUtils from './utils';

export class HarService {
  /** HAR 转换所需的当前 Recording 抓包数据。 */
  private readonly captureService: CaptureService;
  /** 与原生 archive 共用的异步文件任务管理器。 */
  private readonly transferService: TransferService;

  /** 绑定抓包数据与共享任务管理器；文件系统与正文始终留在 Core。 */
  constructor(captureService: CaptureService, transferService: TransferService) {
    this.captureService = captureService;
    this.transferService = transferService;
  }

  /** 启动 HAR 导出任务并立即返回 running 快照。 */
  startExport(
    jobId: string,
    filePath: string,
    options: HarExportOptions,
  ): TransferJobSnapshot {
    return this.transferService.start(jobId, 'har-export', filePath, (abortSignal, onProgress) =>
      this.exportToFile(filePath, options, abortSignal, onProgress));
  }

  /** 启动 HAR 导入任务并立即返回 running 快照。 */
  startImport(jobId: string, filePath: string): TransferJobSnapshot {
    return this.transferService.start(jobId, 'har-import', filePath, (abortSignal, onProgress) =>
      this.importFromFile(filePath, abortSignal, onProgress));
  }

  /** 将指定 Capture 范围原子导出为标准 HAR 1.2 文件。 */
  async exportToFile(
    filePath: string,
    options: HarExportOptions,
    abortSignal: AbortSignal,
    onProgress?: HarProgressListener,
  ): Promise<HarTransferResult> {
    HarUtils.assertTransferPath(filePath, '.har');
    const exchangeIds = await this.listExchangeIds(options.scope, abortSignal);
    const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
    const output = await open(temporaryPath, 'wx');
    let processed = 0;

    try {
      await output.write(
        '{"log":{"version":"1.2","creator":{"name":"Interceptor","version":' +
          `${JSON.stringify(appVersion)}},"entries":[`,
      );
      for (const exchangeId of exchangeIds) {
        HarUtils.throwIfAborted(abortSignal);
        const detail = await this.captureService.getExchangeDetail(exchangeId);
        if (!detail) {
          continue;
        }
        const entry = await this.toHarEntry(detail, options.redaction, abortSignal);
        await output.write(`${processed > 0 ? ',' : ''}${JSON.stringify(entry)}`);
        processed += 1;
        onProgress?.({ processed, total: exchangeIds.length });
      }
      await output.write(']}}');
      await output.sync();
      await output.close();
      // 直接 rename 覆盖，不留旧文件已删、新文件未就位的窗口。
      await rename(temporaryPath, filePath);
    } catch (error) {
      await output.close().catch(() => undefined);
      await rm(temporaryPath, { force: true });
      throw error;
    }

    return {
      processed,
      total: exchangeIds.length,
      warnings: [
        'HAR cannot preserve HTTP/2 pseudo-headers or trailers, WebSocket messages, TLS details, or rule history.',
      ],
    };
  }

  /** 校验并导入 HAR 1.2 文件；失败或取消时回滚新建 Session。 */
  async importFromFile(
    filePath: string,
    abortSignal: AbortSignal,
    onProgress?: HarProgressListener,
  ): Promise<HarTransferResult> {
    HarUtils.assertTransferPath(filePath, '.har');
    const fileStats = await stat(filePath);
    if (!fileStats.isFile()) {
      throw new InvalidHarError('HAR source must be a regular file.');
    }
    HarUtils.throwIfAborted(abortSignal);
    const source = await readFile(filePath, { signal: abortSignal });
    const document = DocumentParser.parse(source);
    const sessionId = `har-${randomUUID()}`;
    const startedAt = document.entries[0]?.startedAt ?? Date.now();
    await this.captureService.ensureSession({
      id: sessionId,
      name: `Imported HAR - ${path.basename(filePath)}`,
      startedAt,
      captureMode: 'har-import',
      appVersion,
    });

    let processed = 0;
    try {
      for (let offset = 0; offset < document.entries.length; offset += HAR_IMPORT_BATCH_SIZE) {
        HarUtils.throwIfAborted(abortSignal);
        const batchEntries = document.entries.slice(
          offset,
          offset + HAR_IMPORT_BATCH_SIZE,
        );
        const exchanges: ExchangeInput[] = [];
        for (const entry of batchEntries) {
          exchanges.push(await this.toExchange(entry, sessionId, abortSignal));
        }
        await this.captureService.appendExchanges(exchanges);
        processed += exchanges.length;
        onProgress?.({ processed, total: document.entries.length });
      }
    } catch (error) {
      await this.captureService.cleanup({ kind: 'session', sessionId });
      throw error;
    }

    return {
      processed,
      total: document.entries.length,
      warnings: document.creator.name === 'Unknown HAR producer'
        ? ['The HAR did not identify its creator.']
        : [],
    };
  }

  /** 根据导出范围枚举 Exchange ID。 */
  private async listExchangeIds(
    scope: HarExportScope,
    abortSignal: AbortSignal,
  ): Promise<string[]> {
    if (scope.kind === 'selected') {
      return [...new Set(scope.exchangeIds)];
    }

    const exchangeIds: string[] = [];
    let cursor: string | undefined;
    do {
      HarUtils.throwIfAborted(abortSignal);
      const page = await this.captureService.querySessions({
        cursor,
        limit: HAR_EXPORT_PAGE_SIZE,
        sort: 'started_asc',
        filter: scope.kind === 'filter' ? scope.filter : {},
      });
      exchangeIds.push(...page.items.map((item) => item.id));
      if (!page.hasMore) {
        break;
      }
      if (!page.nextCursor || page.nextCursor === cursor) {
        throw new Error('Storage pagination did not advance.');
      }
      cursor = page.nextCursor;
    } while (true);
    return exchangeIds;
  }

  /** 把一条 Capture detail 映射成标准 HAR entry 并应用脱敏。 */
  private async toHarEntry(
    detail: CaptureExchangeDetail,
    redaction: HarRedactionOptions,
    abortSignal: AbortSignal,
  ): Promise<Record<string, unknown>> {
    const requestHeaders = HarUtils.redactHeaders(
      detail.requestHeaders,
      redaction,
      'request',
    );
    const responseHeaders = HarUtils.redactHeaders(
      detail.responseHeaders,
      redaction,
      'response',
    );
    const requestBody = redaction.bodies
      ? undefined
      : await this.readBody(detail.requestBody, abortSignal);
    const encodedResponseBody = redaction.bodies
      ? undefined
      : await this.readBody(detail.responseBody, abortSignal);
    let responseBody = encodedResponseBody;
    let responseCompression: number | undefined;
    if (encodedResponseBody && detail.responseBody?.contentEncoding) {
      const decoded = await decodeBody(
        encodedResponseBody,
        detail.responseBody.contentEncoding,
      );
      if (decoded.status === 'ok') {
        responseBody = Buffer.from(decoded.data);
        responseCompression =
          responseBody.byteLength - encodedResponseBody.byteLength;
      }
    }
    const duration = detail.summary.durationMs ?? 0;
    const requestMime = detail.requestMime ??
      HarUtils.headerValue(requestHeaders, 'content-type');
    const responseMime = detail.summary.responseMime ??
      HarUtils.headerValue(responseHeaders, 'content-type') ??
      'application/octet-stream';
    const requestUrl = redaction.authorization
      ? HarUtils.redactUrl(detail.url)
      : detail.url;
    const queryString = redaction.authorization
      ? HarUtils.redactQueryString(HarUtils.readQueryString(detail.url))
      : HarUtils.readQueryString(detail.url);

    return {
      startedDateTime: new Date(detail.summary.startedAt).toISOString(),
      time: duration,
      request: {
        method: detail.summary.method,
        url: requestUrl,
        httpVersion: HarUtils.toHarHttpVersion(detail.summary.protocol),
        headers: requestHeaders.map((header) =>
          HarUtils.toHarHeader(header)),
        queryString,
        cookies: [],
        headersSize: -1,
        bodySize: requestBody?.byteLength ?? detail.summary.requestBytes,
        ...(requestBody
          ? { postData: HarUtils.toHarPostData(requestBody, requestMime) }
          : {}),
      },
      response: {
        status: detail.summary.statusCode ?? 0,
        statusText: detail.statusText ?? '',
        httpVersion: HarUtils.toHarHttpVersion(detail.summary.protocol),
        headers: responseHeaders.map((header) =>
          HarUtils.toHarHeader(header)),
        cookies: [],
        content: {
          ...HarUtils.toHarContent(
            responseBody,
            responseBody?.byteLength ??
              detail.responseBody?.decodedSize ??
              detail.summary.responseBytes,
            responseMime,
          ),
          ...(responseCompression !== undefined
            ? { compression: responseCompression }
            : {}),
        },
        redirectURL: HarUtils.headerValue(responseHeaders, 'location') ?? '',
        headersSize: -1,
        bodySize: encodedResponseBody?.byteLength ?? detail.summary.responseBytes,
      },
      cache: {},
      timings: {
        blocked: -1,
        dns: -1,
        connect: -1,
        ssl: -1,
        send: 0,
        wait: duration,
        receive: 0,
      },
      _interceptor: {
        exchangeId: detail.summary.id,
        state: detail.summary.state,
        ...(detail.errorCode ? { errorCode: detail.errorCode } : {}),
      },
    };
  }

  /** 把一条已验证 HAR entry 映射成内部 ExchangeInput。 */
  private async toExchange(
    entry: ParsedHarEntry,
    sessionId: string,
    abortSignal: AbortSignal,
  ): Promise<ExchangeInput> {
    HarUtils.throwIfAborted(abortSignal);
    const parsedUrl = new URL(entry.url);
    const requestBody = await this.persistBody(
      entry.requestBody,
      entry.requestMime,
      abortSignal,
    );
    const responseBody = await this.persistBody(
      entry.responseBody,
      entry.responseMime,
      abortSignal,
    );
    const id = `har-exchange-${randomUUID()}`;
    return {
      id,
      sessionId,
      method: entry.method,
      scheme: parsedUrl.protocol.slice(0, -1),
      host: parsedUrl.hostname,
      port: parsedUrl.port ? Number(parsedUrl.port) : undefined,
      path: `${parsedUrl.pathname}${parsedUrl.search}`,
      url: entry.url,
      protocol: entry.protocol,
      statusCode: entry.statusCode,
      statusText: entry.statusText,
      requestMime: entry.requestMime,
      responseMime: entry.responseMime,
      startedAt: entry.startedAt,
      completedAt: entry.startedAt + entry.durationMs,
      requestBytes: entry.requestBody?.byteLength ?? 0,
      responseBytes: entry.responseBody?.byteLength ?? 0,
      state: entry.statusCode === undefined ? 'failed' : 'completed',
      headers: [
        ...entry.requestHeaders.map((header) => ({
          kind: 'request' as const,
          ...header,
        })),
        ...entry.responseHeaders.map((header) => ({
          kind: 'response' as const,
          ...header,
        })),
      ],
      requestBody,
      responseBody,
    };
  }

  /** 把导入正文写入 BodyStore 并生成 hash metadata。 */
  private async persistBody(
    body: Buffer | undefined,
    mediaType: string | undefined,
    abortSignal: AbortSignal,
  ) {
    if (!body) {
      return undefined;
    }
    HarUtils.throwIfAborted(abortSignal);
    const stored = await this.captureService.writeBody(
      HarUtils.singleChunk(body),
    );
    return {
      id: `har-body-${randomUUID()}`,
      blobHash: stored.hash,
      encodedSize: stored.size,
      decodedSize: stored.size,
      mediaType,
      truncated: false,
      decodeStatus: 'ok' as const,
    };
  }

  /** 按有限 chunk 从 BodyStore 读取完整单条 HAR 正文。 */
  private async readBody(
    body: CaptureBodyRef | undefined,
    abortSignal: AbortSignal,
  ): Promise<Buffer | undefined> {
    if (!body?.bodyHash) {
      return undefined;
    }
    const chunks: Buffer[] = [];
    let offset = 0;
    while (offset < body.encodedSize) {
      HarUtils.throwIfAborted(abortSignal);
      const length = Math.min(
        HAR_BODY_READ_CHUNK_BYTES,
        body.encodedSize - offset,
      );
      const chunk = await this.captureService.readBodyRange(body.bodyHash, offset, length);
      if (chunk.byteLength === 0) {
        break;
      }
      chunks.push(chunk);
      offset += chunk.byteLength;
    }
    return Buffer.concat(chunks, offset);
  }
}