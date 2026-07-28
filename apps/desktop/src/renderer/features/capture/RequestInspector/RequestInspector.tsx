import { Tooltip } from 'antd';
import { Copy, X } from 'lucide-react';
import { type ReactNode, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import type {
  CaptureHeader,
  CaptureHeaderRuleEffect,
} from '../../../../shared/desktop-api';
import { AUTOMATION_IDS, type AutomationId } from '../../../../shared/automation-ids';
import { cx, IconButton, MethodBadge, SectionHeader, StatusBadge, useClipboardCopy } from '../../../components';
import { useCaptureStore } from '../data/captureStore';
import {
  GRPC_INSPECTOR_TABS,
  INSPECTOR_TABS,
  TLS_TUNNEL_INSPECTOR_TABS,
  WEBSOCKET_INSPECTOR_TABS,
} from '../constants';
import type { InspectorTab, StatusKind } from '../interfaces';
import { TlsPanel } from './TlsPanel';
import { TlsTunnelPanel } from './TlsTunnelPanel';
import {
  displayPath,
  headersWithoutCookies,
  headersWithRuleEffects,
  protocolLabel,
  protocolSegment,
  responseTimingSegments,
  retainInspectorTab,
  sizeLabel,
  suggestedBodyFileName,
  statusKind,
  statusLabel,
  statusTone,
  timeLabel,
  typeLabel,
} from '../utils';
import { useExchangeDetail } from '../data/useExchangeDetail';
import { BodyView } from './BodyView';
import { GrpcMessages } from './GrpcMessages';
import { WebSocketMessages } from './WebSocketMessages';
import styles from './RequestInspector.module.css';

type KvRow = [
  key: string,
  value: ReactNode,
  accent?: 'a' | 'g',
  copyText?: string,
  ruleEffect?: CaptureHeaderRuleEffect,
  ruleId?: string,
];

const INSPECTOR_TAB_AUTOMATION_IDS: Record<InspectorTab, AutomationId> =
  AUTOMATION_IDS.capture.inspector.tab;

function headersToRows(headers: CaptureHeader[]): KvRow[] {
  // HTTP/2 伪首部（:method/:status 等）高亮区分于普通头。
  return headers.map((header) => [
    header.name,
    header.value,
    header.isPseudo ? 'a' : undefined,
    undefined,
    header.ruleEffect,
    header.ruleId,
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
  return headers
    .filter((header) => header.name.toLowerCase() === 'cookie')
    .flatMap((header) =>
      header.value
        .split(';')
        .map((pair) => pair.trim())
        .filter(Boolean)
        .map((pair) => {
          const separator = pair.indexOf('=');
          return [
            separator === -1 ? pair : pair.slice(0, separator),
            separator === -1 ? '' : pair.slice(separator + 1),
            undefined,
            undefined,
            header.ruleEffect,
            header.ruleId,
          ] as KvRow;
        }),
    );
}

/** 收集响应 Set-Cookie 头（每条一行）为 KV 行。 */
function responseCookieRows(headers: CaptureHeader[]): KvRow[] {
  return headers
    .filter((header) => header.name.toLowerCase() === 'set-cookie')
    .map((header) => {
      const separator = header.value.indexOf('=');
      return [
        separator === -1 ? header.value : header.value.slice(0, separator),
        header.value,
        undefined,
        undefined,
        header.ruleEffect,
        header.ruleId,
      ] as KvRow;
    });
}

function isGrpcMime(value: string | undefined): boolean {
  const essence = value?.split(';', 1)[0]?.trim().toLowerCase();
  return essence === 'application/grpc'
    || essence?.startsWith('application/grpc+') === true;
}

function Kv({
  rows,
  onOpenRule,
}: {
  rows: KvRow[];
  onOpenRule?: (ruleId: string) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const copy = useClipboardCopy();
  return (
    <div className={styles.kv}>
      {rows.map(([key, value, accent, copyText, ruleEffect, ruleId], index) => {
        const copyValue = copyText ?? (typeof value === 'string' ? value : undefined);
        const inactive = ruleEffect === 'replace' || ruleEffect === 'remove';
        return (
          <div className={styles.kvRow} key={index}>
            <span className={styles.key}>{key}</span>
            <span
              className={cx(styles.value, accent === 'a' && styles.accent, accent === 'g' && styles.good)}
            >
              <span className={cx(inactive && styles.ruleInactive)}>{value}</span>
              {ruleEffect && ruleId && onOpenRule ? (
                <button
                  type="button"
                  className={styles.ruleEffect}
                  data-effect={ruleEffect}
                  onClick={() => onOpenRule(ruleId)}
                >
                  {t(`capture.ruleEffect.${ruleEffect}`)}
                </button>
              ) : ruleEffect ? (
                <span className={styles.ruleEffect} data-effect={ruleEffect}>
                  {t(`capture.ruleEffect.${ruleEffect}`)}
                </span>
              ) : null}
              {copyValue ? (
                <IconButton
                  className={styles.copyBtn}
                  icon={Copy}
                  label={t('capture.copy')}
                  size="sm"
                  onClick={() => copy(copyValue)}
                />
              ) : null}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Status value styled like the request list: a colored dot plus the original status text. */
function StatusValue({ kind, children }: { kind: StatusKind; children: ReactNode }): React.JSX.Element {
  return (
    <span className={cx(styles.statusValue, styles[kind])}>
      <span className={styles.statusDot} />
      {children}
    </span>
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

export interface RequestInspectorProps {
  mitmActive: boolean;
  onSetupHttps: () => void;
  onOpenRule: (ruleId: string) => void;
}

/** Right-hand inspector for the selected request. */
export function RequestInspector({
  mitmActive,
  onSetupHttps,
  onOpenRule,
}: RequestInspectorProps): React.JSX.Element {
  const { i18n, t } = useTranslation();
  const copy = useClipboardCopy();
  const tab = useCaptureStore((state) => state.inspectorTab);
  const setTab = useCaptureStore((state) => state.setInspectorTab);
  const selectedId = useCaptureStore((state) => state.selectedId);
  const select = useCaptureStore((state) => state.select);
  const showQueryParams = useCaptureStore((state) => state.showQueryParams);
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
  const responseHeaders = headersWithRuleEffects(
    detail?.responseHeaders ?? [],
    'response',
  );
  const requestHeaders = headersWithRuleEffects(
    detail?.requestHeaders ?? [],
    'request',
  );
  const visibleResponseHeaders = headersWithoutCookies(responseHeaders);
  const visibleRequestHeaders = headersWithoutCookies(requestHeaders);
  const responseTrailers = detail?.responseTrailers ?? [];
  const requestTrailers = detail?.requestTrailers ?? [];
  const scheme = detail?.scheme ?? (view?.secure ? 'https' : 'http');
  const isWebSocket = view ? protocolSegment(view.protocol) === 'ws' : false;
  const isTlsTunnel = view
    ? view.method.toUpperCase() === 'CONNECT' && protocolLabel(view.protocol) === 'tls'
    : false;
  const isGrpc = !isWebSocket && Boolean(
    view &&
      protocolSegment(view.protocol) === 'h2' &&
      (isGrpcMime(detail?.requestMime) || isGrpcMime(view.responseMime)),
  );
  const inspectorTabs = isTlsTunnel
    ? TLS_TUNNEL_INSPECTOR_TABS
    : isWebSocket
      ? WEBSOCKET_INSPECTOR_TABS
      : isGrpc
        ? GRPC_INSPECTOR_TABS
        : INSPECTOR_TABS;
  const tlsPort = inferPort(detail?.url, scheme);
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
  const timingSegments = view
    ? responseTimingSegments(
        view.startedAt,
        detail?.responseStartedAt,
        detail?.completedAt,
      )
    : [];

  useEffect(() => {
    const fallback = isTlsTunnel
      ? 'tunnel'
      : isWebSocket
        ? 'messages'
        : isGrpc
          ? 'grpc'
          : 'headers';
    const nextTab = retainInspectorTab(tab, inspectorTabs, fallback);
    if (nextTab !== tab) {
      setTab(nextTab);
    }
  }, [inspectorTabs, isGrpc, isTlsTunnel, isWebSocket, tab]);

  return (
    <div className={styles.inspector}>
      <div className={styles.head}>
        <div className={styles.summaryCard}>
          {view ? (
            <span className={styles.methodChip} data-parity="capture-inspector-method">{view.method.toUpperCase()}</span>
          ) : null}
          <span className={styles.urlWrap}>
            <Tooltip title={view ? url : ''} placement="topLeft" mouseEnterDelay={0.4}>
              <span className={styles.url} data-parity="capture-inspector-host">
                {view ? (
                  <span className={styles.urlText}>
                    {view.host ?? ''}{isTlsTunnel ? `:${tlsPort}` : displayPath(view.path, showQueryParams)}
                  </span>
                ) : (
                  <span className={styles.urlText}>{t('capture.selectRequest')}</span>
                )}
              </span>
            </Tooltip>
            {view ? (
              <IconButton
                className={styles.urlCopy}
                icon={Copy}
                label={t('capture.copyUrl')}
                size="sm"
                onClick={() => copy(url)}
              />
            ) : null}
          </span>
          {view ? (
            <StatusBadge
              tone={statusTone(view.statusCode)}
              parityId="capture-inspector-status"
            >
              {statusLabel(view)}
            </StatusBadge>
          ) : null}
        </div>
        <Tooltip title={t('capture.close')} mouseEnterDelay={0.4}>
          <button
            type="button"
            className={styles.closeButton}
            onClick={() => select(null)}
            aria-label={t('capture.close')}
            data-automation-id={AUTOMATION_IDS.capture.inspector.close}
          >
            <X size={15} strokeWidth={2} />
          </button>
        </Tooltip>
      </div>

      <div className={styles.tabs}>
        {inspectorTabs.map(({ id, labelKey }) => (
          <span
            key={id}
            className={cx(tab === id && styles.active)}
            onClick={() => setTab(id)}
            data-automation-id={INSPECTOR_TAB_AUTOMATION_IDS[id]}
          >
            {labelKey === 'TLS' ? 'TLS' : t(labelKey)}
          </span>
        ))}
      </div>

      <div className={styles.scroll}>
        {tab === 'tunnel' && isTlsTunnel && view ? (
          <TlsTunnelPanel
            host={view.host ?? ''}
            mitmActive={mitmActive}
            port={tlsPort}
            open={view.state !== 'completed' && view.state !== 'failed'}
            onSetupHttps={onSetupHttps}
          />
        ) : null}

        {tab === 'headers' ? (
          <div className={styles.panel}>
            <Section title={t('capture.general')}>
              {view ? (
                <Kv
                  rows={[
                    [t('capture.requestUrl'), url],
                    [t('capture.requestMethod'), <MethodBadge method={view.method} />, undefined, view.method.toUpperCase()],
                    [t('capture.statusCode'), <StatusValue kind={statusKind(view.statusCode)}>{statusText}</StatusValue>, undefined, statusText],
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
            <Section title={t('capture.responseHeaders')} count={visibleResponseHeaders.length}>
              {visibleResponseHeaders.length ? (
                <Kv rows={headersToRows(visibleResponseHeaders)} onOpenRule={onOpenRule} />
              ) : (
                <div className={styles.empty}>{t('capture.noResponseHeaders')}</div>
              )}
            </Section>
            <Section title={t('capture.requestHeaders')} count={visibleRequestHeaders.length}>
              {visibleRequestHeaders.length ? (
                <Kv rows={headersToRows(visibleRequestHeaders)} onOpenRule={onOpenRule} />
              ) : (
                <div className={styles.empty}>{t('capture.noRequestHeaders')}</div>
              )}
            </Section>
            {responseTrailers.length ? (
              <Section title={t('capture.responseTrailers')} count={responseTrailers.length}>
                <Kv rows={headersToRows(responseTrailers)} onOpenRule={onOpenRule} />
              </Section>
            ) : null}
            {requestTrailers.length ? (
              <Section title={t('capture.requestTrailers')} count={requestTrailers.length}>
                <Kv rows={headersToRows(requestTrailers)} onOpenRule={onOpenRule} />
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
            <Section
              title={t('capture.requestPayload')}
              count={
                detail?.requestBody
                  ? `${typeLabel(detail.requestBody.mediaType ?? detail.requestMime)} · ${sizeLabel(view?.requestBytes ?? 0, i18n.language)}`
                  : undefined
              }
            >
              {detail?.requestBody ? (
                <BodyView
                  body={{
                    ...detail.requestBody,
                    mediaType: detail.requestBody.mediaType ?? detail.requestMime,
                  }}
                  suggestedFileName={suggestedBodyFileName(
                    url,
                    detail.requestBody.mediaType ?? detail.requestMime,
                    'request-body',
                  )}
                />
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
                <BodyView
                  body={{
                    ...detail.responseBody,
                    mediaType: detail.responseBody.mediaType ?? view?.responseMime,
                  }}
                  suggestedFileName={suggestedBodyFileName(
                    url,
                    detail.responseBody.mediaType ?? view?.responseMime,
                    'response-body',
                  )}
                />
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
              {timingSegments.length > 0 ? (
                <div className={styles.timeline}>
                  {timingSegments.map((segment) => (
                    <div key={segment.id} className={styles.timelineRow}>
                      <span className={styles.timelineLabel}>
                        {segment.id === 'waiting'
                          ? `${t('settings.update.waiting')} (TTFB)`
                          : t('settings.responseBodies')}
                      </span>
                      <span className={styles.timelineTime}>
                        {segment.durationMs < 1
                          ? '<1 ms'
                          : `${new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 0 }).format(segment.durationMs)} ms`}
                      </span>
                      <span className={styles.timelineBar}>
                        <i
                          style={{
                            left: `${segment.offsetPercent}%`,
                            width: `${Math.max(segment.widthPercent, 1)}%`,
                          }}
                        />
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
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
              {timingSegments.length === 0 ? (
                <div className={styles.empty}>{t('capture.waterfallLater')}</div>
              ) : null}
            </Section>
          </div>
        ) : null}

        {tab === 'cookies' ? (
          <div className={styles.panel}>
            <Section title={t('capture.requestCookies')} count={requestCookieRows(requestHeaders).length}>
              {requestCookieRows(requestHeaders).length ? (
                <Kv rows={requestCookieRows(requestHeaders)} onOpenRule={onOpenRule} />
              ) : (
                <div className={styles.empty}>{t('capture.noRequestCookies')}</div>
              )}
            </Section>
            <Section title={t('capture.responseCookies')} count={responseCookieRows(responseHeaders).length}>
              {responseCookieRows(responseHeaders).length ? (
                <Kv rows={responseCookieRows(responseHeaders)} onOpenRule={onOpenRule} />
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
