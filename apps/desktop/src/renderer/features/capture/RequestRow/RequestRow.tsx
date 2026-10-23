import {
  AppWindow,
  ListOrdered,
  Lock,
  Pause,
} from 'lucide-react';
import { memo, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';

import type { CaptureExchangeSummary } from '../../../../shared/desktop-api';
import { AutomationIdFactory } from '../../../../shared/automation-ids';
import { cx, MethodBadge, sizeLabel } from '../../../components';
import { useBreakpointsStore } from '../../breakpoints';
import { breakpointQueuePosition } from '../../breakpoints/utils';
import { useCaptureStore } from '../data/captureStore';
import { AndroidSourceIcon } from '../AndroidSourceIcon/AndroidSourceIcon';
import {
  displayBytes,
  displayPath,
  protocolLabel,
  statusKind,
  statusLabel,
  timeLabel,
  typeLabel,
} from '../utils';
import styles from './RequestRow.module.css';

export interface RequestRowProps {
  summary: CaptureExchangeSummary;
  selected: boolean;
  /** 虚拟化定位偏移（像素）；由父列表的 virtualizer 提供。 */
  offsetTop: number;
  onSelect: (id: string) => void;
  onOpenContextMenu: (
    summary: CaptureExchangeSummary,
  ) => void;
}

/** 虚拟化列表的行组件：memo 化，实时数据更新时仅内容/位置变化的行才 re-render。 */
export const RequestRow = memo(function RequestRow({
  summary,
  selected,
  offsetTop,
  onSelect,
  onOpenContextMenu,
}: RequestRowProps): React.JSX.Element {
  const { i18n, t } = useTranslation();
  // 挂起的是真实流量，必须就地显示在这一行上，而不是另一个页面。
  const breakpoints = useBreakpointsStore((state) => state.breakpoints);
  const pausedBreakpoint = breakpoints.find(
    (breakpoint) => breakpoint.exchangeId === summary.id,
  ) ?? null;
  const queuePosition = pausedBreakpoint
    ? breakpointQueuePosition(breakpoints, pausedBreakpoint)
    : null;
  const pausedPhase = pausedBreakpoint?.phase ?? null;
  const queued = queuePosition !== null && queuePosition > 1;
  const kind = statusKind(summary.statusCode);
  const isTlsTunnel = protocolLabel(summary.protocol) === 'tls';
  // 图标由 Main 异步推送，通常晚于本行渲染；订阅 map 才能在到达时重新取图。
  // undefined 为还在路上，null 为取不到（如系统权限进程没有可执行文件路径）。
  const clientAppIcon = useCaptureStore((state) =>
    summary.appId ? state.clientAppIcons.get(summary.appId) : undefined,
  );
  const androidSource = summary.appId?.startsWith('android:') === true;
  const showQueryParams = useCaptureStore((state) => state.showQueryParams);
  const timeLabels = {
    closed: t('capture.closed'),
    open: t('capture.open'),
    failed: t('capture.failed'),
  };
  const style: CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    transform: `translateY(${offsetTop}px)`,
  };
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cx(styles.row, selected && styles.selected, pausedPhase && styles.paused)}
      onClick={() => onSelect(summary.id)}
      onContextMenu={(event) => {
        onOpenContextMenu(summary);
      }}
      style={style}
      data-automation-id={AutomationIdFactory.captureRequestRow(summary.id)}
      data-breakpoint-id={pausedBreakpoint?.id}
      data-queue-key={pausedBreakpoint?.queueKey}
      data-queue-position={queuePosition ?? undefined}
      data-breakpoint-state={pausedBreakpoint ? queued ? 'queued' : 'head' : undefined}
      data-rule-id={pausedBreakpoint?.ruleId}
    >
        <span
          className={styles.clientApp}
          data-parity={
            clientAppIcon || androidSource ? 'capture-list-app-cell' : 'capture-list-app-cell-unknown'
          }
        >
          {androidSource ? (
            <AndroidSourceIcon label={summary.appName} />
          ) : clientAppIcon ? (
            <img
              className={styles.clientAppIcon}
              src={clientAppIcon}
              alt={summary.appName ?? ''}
              title={summary.appName ?? ''}
            />
          ) : summary.appId !== undefined && clientAppIcon === undefined ? (
            <span className={styles.clientAppLoading} />
          ) : (
            <AppWindow
              className={styles.clientAppUnknown}
              size={16}
              strokeWidth={1.8}
              aria-label={summary.appName ?? ''}
            />
          )}
        </span>
        <MethodBadge method={summary.method} />
        <span className={cx(styles.host, isTlsTunnel && styles.tunnel)}>
          <span className={styles.path} data-parity="capture-list-path-cell">
            {isTlsTunnel ? t('capture.httpsEncrypted') : displayPath(summary.path, showQueryParams)}
          </span>
          <span className={styles.hostName} data-parity="capture-list-host-cell">
            {summary.secure ? <Lock size={11} strokeWidth={2.2} /> : null}
            <span className={styles.hostText}>{summary.host ?? '—'}</span>
          </span>
        </span>
        {pausedPhase ? (
          <span
            className={styles.pausedStatus}
            role="img"
            aria-label={queued
              ? t('breakpoints.queued')
              : pausedPhase === 'response'
                ? t('breakpoints.responsePaused')
                : t('breakpoints.requestPaused')
            }
            title={queued
              ? t('breakpoints.queued')
              : pausedPhase === 'response'
                ? t('breakpoints.responsePaused')
                : t('breakpoints.requestPaused')
            }
          >
            {queued
              ? <ListOrdered size={13} strokeWidth={2.2} />
              : <Pause size={13} strokeWidth={2.2} />}
          </span>
        ) : (
          <span
            className={cx(styles.status, styles[kind])}
            data-parity="capture-list-status-cell"
          >
            <span className={styles.dot} />
            {statusLabel(summary)}
          </span>
        )}
        <span className={styles.proto} data-parity="capture-list-proto-cell">
          {protocolLabel(summary.protocol)}
        </span>
        <span className={styles.type} data-parity="capture-list-type-cell">
          {typeLabel(summary.responseMime)}
        </span>
        <span
          className={cx(styles.size, pausedPhase === 'request' && styles.muted)}
          data-parity="capture-list-size-cell"
        >
          {queued
            ? t('breakpoints.queued')
            : pausedPhase === 'request'
            ? t('breakpoints.waiting')
            : sizeLabel(displayBytes(summary), i18n.language)}
        </span>
        <span
          className={cx(styles.time, pausedPhase && styles.muted)}
          data-parity="capture-list-time-cell"
        >
          {/* 挂起期间耗时只反映用户看了多久，不是真实网络耗时。 */}
          {pausedPhase ? '—' : timeLabel(summary, i18n.language, timeLabels)}
        </span>
    </button>
  );
});
