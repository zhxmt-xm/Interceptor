import { Fragment, type ReactNode, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { CaptureHeader } from '../../../../shared/desktop-api';
import { cx, SectionHeader, StatusBadge } from '../../../components';
import { useCaptureStore } from '../captureStore';
import {
  GRPC_INSPECTOR_TABS,
  INSPECTOR_TABS,
  WEBSOCKET_INSPECTOR_TABS,
  type InspectorTab,
} from '../data';
import { TlsPanel } from './TlsPanel';
import {
  protocolLabel,
  protocolSegment,
  sizeLabel,
  statusLabel,
  statusTone,
  timeLabel,
  typeLabel,
} from '../row-format';
import { useExchangeDetail } from '../useExchangeDetail';
import { BodyView } from './BodyView';
import { GrpcMessages } from './GrpcMessages';
import { WebSocketMessages } from './WebSocketMessages';
import styles from './RequestInspector.module.css';

type KvRow = [key: string, value: ReactNode, accent?: 'a' | 'g'];

function headersToRows(headers: CaptureHeader[]): KvRow[] {
  // HTTP/2 伪首部（:method/:status 等）高亮区分于普通头。
  return headers.map((header) => [
    header.name,
    header.value,
    header.isPseudo ? 'a' : undefined,
  ]);
}

/** 从绝对/相对 URL 提取查询参数为 KV 行。 */
function queryRows(url: string): KvRow[] {
  const search = url.includes('?') ? url.slice(url.indexOf('?') + 1) : '';
  if (!search) {
    return [];
  }
  const params = new URLSearchParams(search);
  return Array.from(params.entries(), ([key, value]) => [key, value] as KvRow);
}

/** 从捕获 URL 推断端口，缺失时按 scheme 回退（https→443、http→80）。 */
function inferPort(url: string | undefined, scheme: string): number {
  if (url) {
    try {
      const parsed = new URL(url);
      if (parsed.port) {
        return Number(parsed.port);
      }
    } catch {
      /* URL 不可解析时按 scheme 回退。 */
    }
  }
  return scheme === 'https' || scheme === 'wss' ? 443 : 80;
}

/** 解析请求 Cookie 头（name=value; …）为 KV 行。 */
function requestCookieRows(headers: CaptureHeader[]): KvRow[] {
  const cookie = headers.find((header) => header.name.toLowerCase() === 'cookie');
  if (!cookie) {
    return [];
  }
  return cookie.value
    .split(';')
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const eq = pair.indexOf('=');
      return eq === -1
        ? ([pair, ''] as KvRow)
        : ([pair.slice(0, eq), pair.slice(eq + 1)] as KvRow);
    });
}

/** 收集响应 Set-Cookie 头（每条一行）为 KV 行。 */
function responseCookieRows(headers: CaptureHeader[]): KvRow[] {
  return headers
    .filter((header) => header.name.toLowerCase() === 'set-cookie')
    .map((header) => {
      const eq = header.value.indexOf('=');
      const name = eq === -1 ? header.value : header.value.slice(0, eq);
      return [name, header.value] as KvRow;
    });
}

function isGrpcMime(value: string | undefined): boolean {
  const essence = value?.split(';', 1)[0]?.trim().toLowerCase();
  return essence === 'application/grpc'
    || essence?.startsWith('application/grpc+') === true;
}

function headerValue(
  headers: CaptureHeader[],
  name: string,
): string | undefined {
  return headers.find((header) => header.name.toLowerCase() === name)?.value;
}

function Kv({ rows }: { rows: KvRow[] }): React.JSX.Element {
  return (
    <div className={styles.kv}>
      {rows.map(([key, value, accent], index) => (
        <Fragment key={index}>
          <span className={styles.key}>{key}</span>
          <span
            className={cx(styles.value, accent === 'a' && styles.accent, accent === 'g' && styles.good)}
          >
            {value}
          </span>
        </Fragment>
      ))}
    </div>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count?: ReactNode;
  children?: ReactNode;
}): React.JSX.Element {
  return (
    <div>
      <SectionHeader count={count}>{title}</SectionHeader>
      {children}
    </div>
  );
}

/** Right-hand inspector for the selected request. */
export function RequestInspector(): React.JSX.Element {
  const { i18n, t } = useTranslation();
  const [tab, setTab] = useState<InspectorTab>('headers');
  const selectedId = useCaptureStore((state) => state.selectedId);
  const summary = useCaptureStore((state) => {
    if (!state.selectedId) {
      return undefined;
    }
    const index = state.indexById.get(state.selectedId);
    return index === undefined ? undefined : state.rows[index];
  });
  const { detail } = useExchangeDetail(selectedId);

  const view = detail?.summary ?? summary;

  const url = view ? detail?.url ?? `${view.host ?? ''}${view.path ?? ''}` : '';
  const responseHeaders = detail?.responseHeaders ?? [];
  const requestHeaders = detail?.requestHeaders ?? [];
  const responseTrailers = detail?.responseTrailers ?? [];
  const requestTrailers = detail?.requestTrailers ?? [];
  const scheme = detail?.scheme ?? (view?.secure ? 'https' : 'http');
  const isWebSocket = view ? protocolSegment(view.protocol) === 'ws' : false;
  const isGrpc = !isWebSocket && Boolean(
    view &&
      protocolSegment(view.protocol) === 'h2' &&
      (isGrpcMime(detail?.requestMime) || isGrpcMime(view.responseMime)),
  );
  const inspectorTabs = isWebSocket
    ? WEBSOCKET_INSPECTOR_TABS
    : isGrpc
      ? GRPC_INSPECTOR_TABS
      : INSPECTOR_TABS;
  const tlsPort = inferPort(detail?.url, scheme);
  const grpcStatus = headerValue(responseTrailers, 'grpc-status')
    ?? headerValue(responseHeaders, 'grpc-status');
  const grpcMessage = headerValue(responseTrailers, 'grpc-message')
    ?? headerValue(responseHeaders, 'grpc-message');
  const statusText = view
    ? view.statusCode !== undefined
      ? `${view.statusCode}${detail?.statusText ? ` ${detail.statusText}` : ''}`
      : statusLabel(view)
    : '';
  const timeLabels = {
    closed: t('capture.closed'),
    open: t('capture.open'),
    failed: t('capture.failed'),
  };
  const exchangeTime = view
    ? timeLabel(view, i18n.language, timeLabels)
    : '';

  useEffect(() => {
    setTab(isWebSocket ? 'messages' : isGrpc ? 'grpc' : 'headers');
  }, [isGrpc, isWebSocket, selectedId]);

  return (
    <div className={styles.inspector}>
      <div className={styles.head}>
        {view ? (
          <span className={styles.methodChip}>{view.method.toUpperCase()}</span>
        ) : null}
        <span className={styles.url}>
          {view ? (
            <>
              <span className={styles.urlDomain}>{view.host ?? ''}</span>
              <span className={styles.urlPath}>{view.path ?? ''}</span>
            </>
          ) : (
            <span className={styles.urlDomain}>{t('capture.selectRequest')}</span>
          )}
        </span>
        {view && view.statusCode !== undefined ? (
          <StatusBadge
            tone={
              isGrpc && grpcStatus !== undefined
                ? grpcStatus === '0'
                  ? 'green'
                  : 'red'
                : statusTone(view.statusCode)
            }
          >
            {isWebSocket && view.statusCode === 101
              ? t('capture.connected')
              : isGrpc && grpcStatus !== undefined
                ? `gRPC ${grpcStatus}${grpcMessage ? ` ${grpcMessage}` : ''}`
                : statusText}
          </StatusBadge>
        ) : null}
      </div>

      <div className={styles.tabs}>
        {inspectorTabs.map(({ id, labelKey }) => (
          <span key={id} className={cx(tab === id && styles.active)} onClick={() => setTab(id)}>
            {labelKey === 'TLS' ? 'TLS' : t(labelKey)}
          </span>
        ))}
      </div>

      <div className={styles.scroll}>
        {tab === 'headers' ? (
          <div className={styles.panel}>
            <Section title={t('capture.general')}>
              {view ? (
                <Kv
                  rows={[
                    [t('capture.requestUrl'), url],
                    [t('capture.requestMethod'), view.method.toUpperCase(), 'a'],
                    [t('capture.statusCode'), statusText, view.statusCode && view.statusCode < 400 ? 'g' : undefined],
                    [t('capture.protocol'), protocolLabel(view.protocol).toUpperCase()],
                    ...(detail?.streamId !== undefined
                      ? [[t('capture.streamId'), String(detail.streamId)] as KvRow]
                      : []),
                    [t('capture.host'), view.host ?? '—'],
                    [t('capture.duration'), exchangeTime],
                  ]}
                />
              ) : (
                <div className={styles.empty}>{t('capture.selectRequest')}</div>
              )}
            </Section>
            <Section title={t('capture.responseHeaders')} count={responseHeaders.length}>
              {responseHeaders.length ? (
                <Kv rows={headersToRows(responseHeaders)} />
              ) : (
                <div className={styles.empty}>{t('capture.noResponseHeaders')}</div>
              )}
            </Section>
            <Section title={t('capture.requestHeaders')} count={requestHeaders.length}>
              {requestHeaders.length ? (
                <Kv rows={headersToRows(requestHeaders)} />
              ) : (
                <div className={styles.empty}>{t('capture.noRequestHeaders')}</div>
              )}
            </Section>
            {responseTrailers.length ? (
              <Section title={t('capture.responseTrailers')} count={responseTrailers.length}>
                <Kv rows={headersToRows(responseTrailers)} />
              </Section>
            ) : null}
            {requestTrailers.length ? (
              <Section title={t('capture.requestTrailers')} count={requestTrailers.length}>
                <Kv rows={headersToRows(requestTrailers)} />
              </Section>
            ) : null}
          </div>
        ) : null}

        {tab === 'request' ? (
          <div className={styles.panel}>
            <Section title={t('capture.requestLine')}>
              {view ? (
                <Kv
                  rows={[
                    [t('capture.method'), view.method.toUpperCase(), 'a'],
                    [t('capture.path'), view.path ?? '/'],
                    [t('capture.version'), protocolLabel(view.protocol).toUpperCase()],
                    [t('capture.scheme'), scheme, 'g'],
                  ]}
                />
              ) : (
                <div className={styles.empty}>{t('capture.selectRequest')}</div>
              )}
            </Section>
            <Section title={t('capture.queryParameters')} count={queryRows(url).length}>
              {queryRows(url).length ? (
                <Kv rows={queryRows(url)} />
              ) : (
                <div className={styles.empty}>{t('capture.noQueryParameters')}</div>
              )}
            </Section>
            <Section title={t('capture.requestPayload')}>
              {detail?.requestBody ? (
                <BodyView body={detail.requestBody} />
              ) : (
                <div className={styles.empty}>{t('capture.noRequestBody')}</div>
              )}
            </Section>
          </div>
        ) : null}

        {tab === 'response' ? (
          <div className={styles.panel}>
            <Section
              title={t('capture.body')}
              count={
                detail?.responseBody
                  ? `${typeLabel(view?.responseMime)} · ${sizeLabel(view?.responseBytes ?? 0, i18n.language)}`
                  : undefined
              }
            >
              {detail?.responseBody ? (
                <BodyView body={detail.responseBody} />
              ) : (
                <div className={styles.empty}>{t('capture.noResponseBody')}</div>
              )}
            </Section>
          </div>
        ) : null}

        {tab === 'messages' && isWebSocket && view ? (
          <WebSocketMessages exchangeId={view.id} startedAt={view.startedAt} />
        ) : null}

        {tab === 'grpc' && isGrpc && detail ? (
          <GrpcMessages detail={detail} />
        ) : null}

        {tab === 'timing' ? (
          <div className={styles.panel}>
            <Section title={t('capture.timing')} count={view ? exchangeTime : undefined}>
              {view ? (
                <Kv
                  rows={[
                    [t('capture.started'), formatTimestamp(view.startedAt, i18n.language)],
                    [t('capture.total'), exchangeTime],
                    [t('capture.requestBytes'), sizeLabel(view.requestBytes, i18n.language)],
                    [t('capture.responseBytes'), sizeLabel(view.responseBytes, i18n.language)],
                  ]}
                />
              ) : (
                <div className={styles.empty}>{t('capture.selectRequest')}</div>
              )}
              <div className={styles.empty}>
                {t('capture.waterfallLater')}
              </div>
            </Section>
          </div>
        ) : null}

        {tab === 'cookies' ? (
          <div className={styles.panel}>
            <Section title={t('capture.requestCookies')} count={requestCookieRows(requestHeaders).length}>
              {requestCookieRows(requestHeaders).length ? (
                <Kv rows={requestCookieRows(requestHeaders)} />
              ) : (
                <div className={styles.empty}>{t('capture.noRequestCookies')}</div>
              )}
            </Section>
            <Section title={t('capture.responseCookies')} count={responseCookieRows(responseHeaders).length}>
              {responseCookieRows(responseHeaders).length ? (
                <Kv rows={responseCookieRows(responseHeaders)} />
              ) : (
                <div className={styles.empty}>{t('capture.noResponseCookies')}</div>
              )}
            </Section>
          </div>
        ) : null}

        {tab === 'tls' ? (
          view ? (
            <TlsPanel
              key={`${view.host ?? ''}:${tlsPort}`}
              host={view.host ?? ''}
              port={tlsPort}
              secure={view.secure}
              scheme={scheme}
              protocol={view.protocol}
            />
          ) : (
            <div className={styles.panel}>
              <div className={styles.empty}>{t('capture.selectRequest')}</div>
            </div>
          )
        ) : null}
      </div>
    </div>
  );
}

function formatTimestamp(timestamp: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(timestamp));
}
