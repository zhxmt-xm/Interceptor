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
import type { ExchangeInput } from '../storage/interfaces';
import {
  HAR_BODY_READ_CHUNK_BYTES,
  HAR_EXPORT_PAGE_SIZE,
  HAR_IMPORT_BATCH_SIZE,
} from './har-constants';
import { HarDocumentParser } from './har-document';
import type {
  HarExportOptions,
  HarExportScope,
  HarProgressListener,
  HarRedactionOptions,
  HarStorage,
  HarTransferResult,
  ParsedHarEntry,
} from './interfaces';
import { InvalidHarError } from './har-invalid-error';
import { TransferJobManager } from '../transfer/entry';
import * as HarUtils from './utils';

export class HarService {
  /** HAR 转换所需的 Storage 门面。 */
  private readonly storage: HarStorage;
  /** 与原生 archive 共用的异步文件任务管理器。 */
  private readonly jobs: TransferJobManager;

  /** 绑定 Core 内存储门面与共享任务管理器；文件系统与正文始终留在 Core。 */
  constructor(storage: HarStorage, jobs: TransferJobManager) {
    this.storage = storage;
    this.jobs = jobs;
  }

  /** 启动 HAR 导出任务并立即返回 running 快照。 */
  startExport(
    jobId: string,
    filePath: string,
    options: HarExportOptions,
  ): TransferJobSnapshot {
    return this.jobs.start(jobId, 'har-export', filePath, (signal, onProgress) =>
      this.exportToFile(filePath, options, signal, onProgress));
  }

  /** 启动 HAR 导入任务并立即返回 running 快照。 */
  startImport(jobId: string, filePath: string): TransferJobSnapshot {
    return this.jobs.start(jobId, 'har-import', filePath, (signal, onProgress) =>
      this.importFromFile(filePath, signal, onProgress));
  }

  /** 将指定 Capture 范围原子导出为标准 HAR 1.2 文件。 */
  async exportToFile(
    filePath: string,
    options: HarExportOptions,
    signal: AbortSignal,
    onProgress?: HarProgressListener,
  ): Promise<HarTransferResult> {
    HarUtils.assertTransferPath(filePath, '.har');
    const exchangeIds = await this.listExchangeIds(options.scope, signal);
    const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
    const output = await open(temporaryPath, 'wx');
    let processed = 0;

    try {
      await output.write(
        '{"log":{"version":"1.2","creator":{"name":"Interceptor","version":' +
          `${JSON.stringify(appVersion)}},"entries":[`,
      );
      for (const exchangeId of exchangeIds) {
        HarUtils.throwIfAborted(signal);
        const detail = await this.storage.getExchangeDetail(exchangeId);
        if (!detail) {
          continue;
        }
        const entry = await this.toHarEntry(detail, options.redaction, signal);
        await output.write(`${processed > 0 ? ',' : ''}${JSON.stringify(entry)}`);
        processed += 1;
        onProgress?.({ processed, total: exchangeIds.length });
      }
      await output.write(']}}');
      await output.sync();
      await output.close();
      await rm(filePath, { force: true });
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
    signal: AbortSignal,
    onProgress?: HarProgressListener,
  ): Promise<HarTransferResult> {
    HarUtils.assertTransferPath(filePath, '.har');
    const fileStats = await stat(filePath);
    if (!fileStats.isFile()) {
      throw new InvalidHarError('HAR source must be a regular file.');
    }
    HarUtils.throwIfAborted(signal);
    const source = await readFile(filePath, { signal });
    const document = HarDocumentParser.parse(source);
    const sessionId = `har-${randomUUID()}`;
    const startedAt = document.entries[0]?.startedAt ?? Date.now();
    await this.storage.ensureSession({
      id: sessionId,
      name: `Imported HAR - ${path.basename(filePath)}`,
      startedAt,
      captureMode: 'har-import',
      appVersion,
    });

    let processed = 0;
    try {
      for (let offset = 0; offset < document.entries.length; offset += HAR_IMPORT_BATCH_SIZE) {
        HarUtils.throwIfAborted(signal);
        const batchEntries = document.entries.slice(
          offset,
          offset + HAR_IMPORT_BATCH_SIZE,
        );
        const exchanges: ExchangeInput[] = [];
        for (const entry of batchEntries) {
          exchanges.push(await this.toExchange(entry, sessionId, signal));
        }
        await this.storage.appendExchanges(exchanges);
        processed += exchanges.length;
        onProgress?.({ processed, total: document.entries.length });
      }
    } catch (error) {
      await this.storage.cleanup({ kind: 'session', sessionId });
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
    signal: AbortSignal,
  ): Promise<string[]> {
    if (scope.kind === 'selected') {
      return [...new Set(scope.exchangeIds)];
    }

    const exchangeIds: string[] = [];
    let cursor: string | undefined;
    do {
      HarUtils.throwIfAborted(signal);
      const page = await this.storage.querySessions({
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
    signal: AbortSignal,
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
      : await this.readBody(detail.requestBody, signal);
    const encodedResponseBody = redaction.bodies
      ? undefined
      : await this.readBody(detail.responseBody, signal);
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
    signal: AbortSignal,
  ): Promise<ExchangeInput> {
    HarUtils.throwIfAborted(signal);
    const parsedUrl = new URL(entry.url);
    const requestBody = await this.persistBody(
      entry.requestBody,
      entry.requestMime,
      signal,
    );
    const responseBody = await this.persistBody(
      entry.responseBody,
      entry.responseMime,
      signal,
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

  /** 把导入正文写入 TemporaryBodyStore 并生成 hash metadata。 */
  private async persistBody(
    body: Buffer | undefined,
    mediaType: string | undefined,
    signal: AbortSignal,
  ) {
    if (!body) {
      return undefined;
    }
    HarUtils.throwIfAborted(signal);
    const stored = await this.storage.writeBody(
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

  /** 按有限 chunk 从 TemporaryBodyStore 读取完整单条 HAR 正文。 */
  private async readBody(
    body: CaptureBodyRef | undefined,
    signal: AbortSignal,
  ): Promise<Buffer | undefined> {
    if (!body?.bodyHash) {
      return undefined;
    }
    const chunks: Buffer[] = [];
    let offset = 0;
    while (offset < body.encodedSize) {
      HarUtils.throwIfAborted(signal);
      const length = Math.min(
        HAR_BODY_READ_CHUNK_BYTES,
        body.encodedSize - offset,
      );
      const chunk = await this.storage.readBodyRange(body.bodyHash, offset, length);
      if (chunk.byteLength === 0) {
        break;
      }
      chunks.push(chunk);
      offset += chunk.byteLength;
    }
    return Buffer.concat(chunks, offset);
  }
}