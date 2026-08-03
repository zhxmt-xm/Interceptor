import { Tooltip } from 'antd';
import { AppWindow, Copy, X } from 'lucide-react';
import { type ReactNode, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import type {
  CaptureBodyRef,
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
            <span className={styles.key} title={key}>{key}</span>
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

/** 发起请求的本机应用：系统图标 + 展示名；图标未到达时只显示名称。 */
function ClientAppValue({
  appId,
  name,
}: {
  appId: string | undefined;
  name: string;
}): React.JSX.Element {
  const icon = useCaptureStore((state) =>
    appId ? state.clientAppIcons.get(appId) : undefined,
  );
  return (
    <span className={styles.clientAppValue} data-parity="capture-inspector-client-app">
      {icon ? (
        <img className={styles.clientAppIcon} src={icon} alt="" />
      ) : appId !== undefined && icon === undefined ? (
        <span className={styles.clientAppLoading} />
      ) : (
        <AppWindow className={styles.clientAppUnknown} size={16} strokeWidth={1.8} />
      )}
      {name}
    </span>
  );
}

function Section({
  title,
  count,
  grow = false,
  children,
}: {
  title: string;
  count?: ReactNode;
  grow?: boolean;
  children?: ReactNode;
}): React.JSX.Element {
  return (
    <div className={cx(grow && styles.sectionGrow)}>
      <SectionHeader count={count}>{title}</SectionHeader>
      {children}
    </div>
  );
}

/** Request/Response 共用的 KV 区块；不给空态文案时无数据就隐藏整段。 */
function KvSection({
  title,
  rows,
  empty,
  onOpenRule,
}: {
  title: string;
  rows: KvRow[];
  empty?: string;
  onOpenRule?: (ruleId: string) => void;
}): React.JSX.Element | null {
  if (rows.length === 0 && !empty) {
    return null;
  }
  return (
    <Section title={title} count={rows.length}>
      {rows.length ? (
        <Kv rows={rows} onOpenRule={onOpenRule} />
      ) : (
        <div className={styles.empty}>{empty}</div>
      )}
    </Section>
  );
}

/** Request/Response 共用的正文区块：只换标题、正文引用、MIME 回退与字节数。 */
function BodySection({
  title,
  body,
  mime,
  bytes,
  url,
  fallbackName,
  empty,
}: {
  title: string;
  body: CaptureBodyRef | undefined;
  mime: string | undefined;
  bytes: number;
  url: string;
  fallbackName: 'request-body' | 'response-body';
  empty: string;
}): React.JSX.Element {
  const { i18n } = useTranslation();
  const mediaType = body?.mediaType ?? mime;
  return (
    <Section
      title={title}
      grow
      count={body ? `${typeLabel(mediaType)} · ${sizeLabel(bytes, i18n.language)}` : undefined}
    >
      {body ? (
        <BodyView
          body={{ ...body, mediaType }}
          suggestedFileName={suggestedBodyFileName(url, mediaType, fallbackName)}
        />
      ) : (
        <div className={styles.empty}>{empty}</div>
      )}
    </Section>
  );
}

export interface RequestInspectorProps {
  onOpenRule: (ruleId: string) => void;
}

/** Right-hand inspector for the selected request. */
export function RequestInspector({
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
  const isWebSocket = view ? protocolLabel(view.protocol) === 'ws' : false;
  const isTlsTunnel = view
    ? view.method.toUpperCase() === 'CONNECT' && protocolLabel(view.protocol) === 'tls'
    : false;
  const isGrpc = !isWebSocket && Boolean(
    view &&
      protocolLabel(view.protocol) === 'h2' &&
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
            port={tlsPort}
            open={view.state !== 'completed' && view.state !== 'failed'}
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
                    ...(view.appName
                      ? [[
                          t('capture.clientApplication'),
                          <ClientAppValue appId={view.appId} name={view.appName} />,
                          undefined,
                          view.appName,
                        ] as KvRow]
                      : []),
                    [t('capture.duration'), exchangeTime],
                  ]}
                />
              ) : (
                <div className={styles.empty}>{t('capture.selectRequest')}</div>
              )}
            </Section>
            <KvSection
              title={t('capture.responseHeaders')}
              rows={headersToRows(visibleResponseHeaders)}
              empty={t('capture.noResponseHeaders')}
              onOpenRule={onOpenRule}
            />
            <KvSection
              title={t('capture.requestHeaders')}
              rows={headersToRows(visibleRequestHeaders)}
              empty={t('capture.noRequestHeaders')}
              onOpenRule={onOpenRule}
            />
            <KvSection
              title={t('capture.responseTrailers')}
              rows={headersToRows(responseTrailers)}
              onOpenRule={onOpenRule}
            />
            <KvSection
              title={t('capture.requestTrailers')}
              rows={headersToRows(requestTrailers)}
              onOpenRule={onOpenRule}
            />
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
            <KvSection
              title={t('capture.queryParameters')}
              rows={queryRows(url)}
              empty={t('capture.noQueryParameters')}
            />
            <BodySection
              title={t('capture.requestPayload')}
              body={detail?.requestBody}
              mime={detail?.requestMime}
              bytes={view?.requestBytes ?? 0}
              url={url}
              fallbackName="request-body"
              empty={t('capture.noRequestBody')}
            />
          </div>
        ) : null}

        {tab === 'response' ? (
          <div className={styles.panel}>
            <BodySection
              title={t('capture.body')}
              body={detail?.responseBody}
              mime={view?.responseMime}
              bytes={view?.responseBytes ?? 0}
              url={url}
              fallbackName="response-body"
              empty={t('capture.noResponseBody')}
            />
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
            <KvSection
              title={t('capture.requestCookies')}
              rows={requestCookieRows(requestHeaders)}
              empty={t('capture.noRequestCookies')}
              onOpenRule={onOpenRule}
            />
            <KvSection
              title={t('capture.responseCookies')}
              rows={responseCookieRows(responseHeaders)}
              empty={t('capture.noResponseCookies')}
              onOpenRule={onOpenRule}
            />
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
