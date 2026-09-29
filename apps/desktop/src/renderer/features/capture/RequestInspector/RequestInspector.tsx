import { Tooltip } from 'antd';
import { Copy, ListOrdered, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { AUTOMATION_IDS, type AutomationId } from '../../../../shared/automation-ids';
import { cx, IconButton, sizeLabel, StatusBadge, useClipboardCopy } from '../../../components';
import { useBreakpointsStore } from '../../breakpoints';
import {
  breakpointQueuePosition,
  isBreakpointQueueHead,
  webSocketQueueBreakpoints,
} from '../../breakpoints/utils';
import { BreakpointInspector } from '../BreakpointInspector/BreakpointInspector';
import {
  GRPC_INSPECTOR_TABS,
  INSPECTOR_TABS,
  TLS_TUNNEL_INSPECTOR_TABS,
  WEBSOCKET_INSPECTOR_TABS,
} from '../constants';
import { useCaptureStore } from '../data/captureStore';
import { useExchangeDetail } from '../data/useExchangeDetail';
import type { InspectorTab, KvRow } from '../interfaces';
import {
  displayPath,
  formatTimestamp,
  headersToRows,
  headersWithoutCookies,
  headersWithRuleEffects,
  inferPort,
  isGrpcMime,
  protocolLabel,
  queryRows,
  requestCookieRows,
  responseCookieRows,
  responseTimingSegments,
  retainInspectorTab,
  statusKind,
  statusLabel,
  statusTone,
  timeLabel,
  typeLabel,
} from '../utils';

import { BodySection } from './BodySection';
import { ClientAppValue } from './ClientAppValue';
import { GrpcMessages } from './GrpcMessages';
import { Kv } from './Kv';
import { KvSection } from './KvSection';
import styles from './RequestInspector.module.css';
import { Section } from './Section';
import { StatusValue } from './StatusValue';
import { TlsPanel } from './TlsPanel';
import { TlsTunnelPanel } from './TlsTunnelPanel';
import { WebSocketMessages } from './WebSocketMessages';

const INSPECTOR_TAB_AUTOMATION_IDS: Record<InspectorTab, AutomationId> =
  AUTOMATION_IDS.capture.inspector.tab;

export interface RequestInspectorProps {
  onOpenRule: (ruleId: string) => void;
  onViewTlsPassthroughPattern(host: string): void;
}

/** Right-hand inspector for the selected request. */
export function RequestInspector({
  onOpenRule,
  onViewTlsPassthroughPattern,
}: RequestInspectorProps): React.JSX.Element {
  const { i18n, t } = useTranslation();
  const copy = useClipboardCopy();
  const scrollRef = useRef<HTMLDivElement>(null);
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
  // 被挂起的 exchange 就地编辑，不跳到另一个页面。
  const breakpoints = useBreakpointsStore((state) => state.breakpoints);
  const exchangeBreakpoints = breakpoints.filter(
    (breakpoint) => breakpoint.exchangeId === selectedId,
  );
  const webSocketBreakpoints = selectedId
    ? webSocketQueueBreakpoints(breakpoints, selectedId)
    : [];
  const pausedBreakpoint = exchangeBreakpoints.find(
    (breakpoint) => breakpoint.phase !== 'websocket',
  ) ?? webSocketBreakpoints[0] ?? null;
  const queuePosition = pausedBreakpoint
    ? breakpointQueuePosition(breakpoints, pausedBreakpoint)
    : null;
  const queueSize = pausedBreakpoint
    ? breakpoints.filter((breakpoint) => breakpoint.queueKey === pausedBreakpoint.queueKey).length
    : 0;
  const queueHead = pausedBreakpoint
    ? isBreakpointQueueHead(breakpoints, pausedBreakpoint)
    : false;
  const queued = pausedBreakpoint !== null && !queueHead;

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
    const nextTab = pausedBreakpoint?.phase === 'websocket'
      ? 'messages'
      : retainInspectorTab(tab, inspectorTabs, fallback);
    if (nextTab !== tab) {
      setTab(nextTab);
    }
  }, [inspectorTabs, isGrpc, isTlsTunnel, isWebSocket, pausedBreakpoint?.phase, setTab, tab]);

  if (pausedBreakpoint && queueHead && pausedBreakpoint.phase !== 'websocket') {
    return (
      <BreakpointInspector
        breakpoint={pausedBreakpoint}
        detail={detail ?? null}
        onClose={() => select(null)}
      />
    );
  }

  return (
    <div
      className={styles.inspector}
      data-breakpoint-id={pausedBreakpoint?.id}
      data-queue-key={pausedBreakpoint?.queueKey}
      data-queue-position={queuePosition ?? undefined}
      data-breakpoint-state={queued ? 'queued' : undefined}
    >
      <div className={styles.head}>
        <div className={styles.summaryCard}>
          {view ? (
            <span
              className={cx(styles.methodChip, view.method.toUpperCase() === 'POST' && styles.postMethodChip)}
              data-parity="capture-inspector-method"
            >
              {view.method.toUpperCase()}
            </span>
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

      {queued ? (
        <div
          className={styles.queuedBanner}
          data-automation-id={AUTOMATION_IDS.breakpoints.queuedDetail}
          data-parity="breakpoint-queued-banner"
        >
          <span className={styles.queuedState} data-parity="breakpoint-queued-state">
            <ListOrdered aria-hidden="true" size={12} strokeWidth={2} />
            {t('breakpoints.queued')}
          </span>
          <span className={styles.queuedPosition} data-parity="breakpoint-queued-position">
            {t('breakpoints.queuePosition', { position: queuePosition, count: queueSize })}
          </span>
          <span className={styles.queuedQueue}>
            {t('breakpoints.queueName', {
              queue: pausedBreakpoint?.queueKey === 'http' ? 'HTTP' : 'WebSocket',
            })}
          </span>
        </div>
      ) : null}

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

      <div
        ref={scrollRef}
        className={styles.scroll}
        data-automation-id={AUTOMATION_IDS.capture.inspector.scroll}
      >
        {tab === 'tunnel' && isTlsTunnel && view ? (
          <TlsTunnelPanel
            host={view.host ?? ''}
            port={tlsPort}
            open={view.state !== 'completed' && view.state !== 'failed'}
            onViewTlsPassthroughPattern={onViewTlsPassthroughPattern}
          />
        ) : null}

        {tab === 'headers' ? (
          <div className={styles.panel}>
            <Section
              title={t('capture.general')}
              automationId={AUTOMATION_IDS.capture.inspector.section.general}
            >
              {view ? (
                <Kv
                  rows={[
                    [t('capture.requestUrl'), url],
                    [t('capture.requestMethod'), view.method.toUpperCase(), 'a'],
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
              automationId={AUTOMATION_IDS.capture.inspector.section.responseHeaders}
              rows={headersToRows(visibleResponseHeaders)}
              empty={t('capture.noResponseHeaders')}
              onOpenRule={onOpenRule}
            />
            <KvSection
              title={t('capture.requestHeaders')}
              automationId={AUTOMATION_IDS.capture.inspector.section.requestHeaders}
              rows={headersToRows(visibleRequestHeaders)}
              empty={t('capture.noRequestHeaders')}
              onOpenRule={onOpenRule}
            />
            <KvSection
              title={t('capture.responseTrailers')}
              automationId={AUTOMATION_IDS.capture.inspector.section.responseTrailers}
              rows={headersToRows(responseTrailers)}
              onOpenRule={onOpenRule}
            />
            <KvSection
              title={t('capture.requestTrailers')}
              automationId={AUTOMATION_IDS.capture.inspector.section.requestTrailers}
              rows={headersToRows(requestTrailers)}
              onOpenRule={onOpenRule}
            />
          </div>
        ) : null}

        {tab === 'request' ? (
          <div className={styles.panel}>
            <Section
              title={t('capture.requestLine')}
              automationId={AUTOMATION_IDS.capture.inspector.section.requestLine}
            >
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
              automationId={AUTOMATION_IDS.capture.inspector.section.queryParameters}
              rows={queryRows(url)}
              empty={t('capture.noQueryParameters')}
            />
            <BodySection
              title={t('capture.requestPayload')}
              exchangeId={view?.id}
              automationId={AUTOMATION_IDS.capture.inspector.section.requestBody}
              body={detail?.requestBody}
              effect={detail?.requestBodyEffect}
              onOpenRule={onOpenRule}
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
              exchangeId={view?.id}
              automationId={AUTOMATION_IDS.capture.inspector.section.responseBody}
              body={detail?.responseBody}
              effect={detail?.responseBodyEffect}
              onOpenRule={onOpenRule}
              mime={view?.responseMime}
              bytes={view?.responseBytes ?? 0}
              url={url}
              fallbackName="response-body"
              empty={t('capture.noResponseBody')}
            />
          </div>
        ) : null}

        {tab === 'messages' && isWebSocket && view ? (
          <WebSocketMessages
            exchangeId={view.id}
            startedAt={view.startedAt}
            connection={`${view.host}${view.path}`}
            pausedBreakpoints={webSocketBreakpoints}
          />
        ) : null}

        {tab === 'grpc' && isGrpc && detail ? (
          <GrpcMessages detail={detail} scrollContainerRef={scrollRef} />
        ) : null}

        {tab === 'timing' ? (
          <div className={styles.panel}>
            <Section
              title={t('capture.timing')}
              automationId={AUTOMATION_IDS.capture.inspector.section.timing}
              count={view ? exchangeTime : undefined}
            >
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
              automationId={AUTOMATION_IDS.capture.inspector.section.requestCookies}
              rows={requestCookieRows(requestHeaders)}
              empty={t('capture.noRequestCookies')}
              onOpenRule={onOpenRule}
            />
            <KvSection
              title={t('capture.responseCookies')}
              automationId={AUTOMATION_IDS.capture.inspector.section.responseCookies}
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
              errorCode={detail?.errorCode}
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
