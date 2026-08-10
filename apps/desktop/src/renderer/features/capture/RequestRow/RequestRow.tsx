import { Dropdown } from 'antd';
import {
  AppWindow,
  Ban,
  ChevronRight,
  Clock,
  Code,
  Crosshair,
  FileText,
  GitBranch,
  Globe,
  Lock,
  MapPin,
  Pause,
  Reply,
  Settings2,
  type LucideIcon,
} from 'lucide-react';
import { memo, type CSSProperties, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type {
  CaptureExchangeSummary,
  RuleActionType,
} from '../../../../shared/desktop-api';
import { AutomationIdFactory } from '../../../../shared/automation-ids';
import { cx, MethodBadge, sizeLabel } from '../../../components';
import { useBreakpointsStore } from '../../breakpoints';
import type { BreakpointScope } from '../../rules/interfaces';
import { useCaptureStore } from '../data/captureStore';
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
  onCreateRule: (
    summary: CaptureExchangeSummary,
    actionType: RuleActionType,
    name: string,
  ) => void;
  onCreateBreakpoint: (
    summary: CaptureExchangeSummary,
    scope: BreakpointScope | 'custom',
    name: string,
  ) => void;
}

/** 虚拟化列表的行组件：memo 化，实时数据更新时仅内容/位置变化的行才 re-render。 */
export const RequestRow = memo(function RequestRow({
  summary,
  selected,
  offsetTop,
  onSelect,
  onCreateRule,
  onCreateBreakpoint,
}: RequestRowProps): React.JSX.Element {
  const { i18n, t } = useTranslation();
  const [contextOpen, setContextOpen] = useState(false);
  const [menuPage, setMenuPage] = useState<'root' | 'breakpoint'>('root');
  // 挂起的是真实流量，必须就地显示在这一行上，而不是另一个页面。
  const pausedPhase = useBreakpointsStore(
    (state) =>
      state.breakpoints.find((breakpoint) => breakpoint.exchangeId === summary.id)?.phase
      ?? null,
  );
  const kind = statusKind(summary.statusCode);
  const isTlsTunnel = protocolLabel(summary.protocol) === 'tls';
  // 图标由 Main 异步推送，通常晚于本行渲染；订阅 map 才能在到达时重新取图。
  // undefined 为还在路上，null 为取不到（如系统权限进程没有可执行文件路径）。
  const clientAppIcon = useCaptureStore((state) =>
    summary.appId ? state.clientAppIcons.get(summary.appId) : undefined,
  );
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
  const actionLabels: Record<RuleActionType, string> = {
    header: t('rules.rewriteHeader'),
    query: t('rules.rewriteQuery'),
    body: t('rules.rewriteBody'),
    status: t('rules.setStatus'),
    synthetic: t('rules.synthetic'),
    'map-local': t('rules.mapLocal'),
    'map-remote': t('rules.mapRemote'),
    block: t('rules.block'),
    delay: t('rules.delay'),
    breakpoint: t('rules.breakpoint'),
  };
  const contextGroups: Array<{
    label: string;
    items: Array<{ type: RuleActionType; icon: LucideIcon; hint: string }>;
  }> = [
    {
      label: t('rules.groupRewrite'),
      items: [
        { type: 'header', icon: Code, hint: t('rules.rewriteHeaderHint') },
        { type: 'query', icon: Code, hint: t('rules.rewriteQueryHint') },
        { type: 'body', icon: FileText, hint: t('rules.rewriteBodyHint') },
        { type: 'status', icon: Code, hint: t('rules.override') },
      ],
    },
    {
      label: t('rules.groupMap'),
      items: [
        { type: 'map-local', icon: MapPin, hint: t('rules.serveFile') },
        { type: 'map-remote', icon: Globe, hint: t('rules.reroute') },
        { type: 'synthetic', icon: Reply, hint: t('rules.returnResponse') },
      ],
    },
    {
      label: t('rules.groupTraffic'),
      items: [
        { type: 'delay', icon: Clock, hint: t('rules.latency') },
      ],
    },
    {
      label: t('rules.groupControl'),
      items: [
        { type: 'block', icon: Ban, hint: t('rules.resetClose') },
      ],
    },
  ];
  const breakpointScopes: Array<{
    scope: BreakpointScope | 'custom';
    icon: LucideIcon;
    name: string;
    hint: string;
  }> = [
    {
      scope: 'endpoint',
      icon: Crosshair,
      name: t('breakpoints.scopeEndpoint'),
      hint: displayPath(summary.path, false),
    },
    {
      scope: 'path-prefix',
      icon: GitBranch,
      name: t('breakpoints.scopePathPrefix'),
      hint: `${displayPath(summary.path, false)}/*`,
    },
    {
      scope: 'host',
      icon: Globe,
      name: t('breakpoints.scopeHost'),
      hint: `${summary.host ?? ''}/*`,
    },
    {
      scope: 'custom',
      icon: Settings2,
      name: t('breakpoints.scopeCustom'),
      hint: t('breakpoints.scopeCustomHint'),
    },
  ];
  const createRule = (type: RuleActionType): void => {
    closeContextMenu();
    const target = `${summary.host ?? ''}${displayPath(summary.path, true)}` || summary.method;
    onCreateRule(summary, type, `${actionLabels[type]} · ${target}`);
  };
  const createBreakpoint = (scope: BreakpointScope | 'custom'): void => {
    closeContextMenu();
    const target = `${summary.host ?? ''}${displayPath(summary.path, true)}` || summary.method;
    onCreateBreakpoint(summary, scope, `${t('rules.breakpoint')} · ${target}`);
  };
  function closeContextMenu(): void {
    setContextOpen(false);
    setMenuPage('root');
  }
  return (
    <Dropdown
      trigger={['contextMenu']}
      open={contextOpen}
      onOpenChange={(open) => {
        setContextOpen(open);
        if (!open) {
          setMenuPage('root');
        }
      }}
      destroyOnHidden
      popupRender={() =>
        menuPage === 'breakpoint' ? (
          <div className={styles.contextMenu}>
            <div className={styles.contextTitle}>{t('breakpoints.createFromRequest')}</div>
            {breakpointScopes.map(({ scope, icon: Icon, name, hint }) => (
              <button
                key={scope}
                type="button"
                className={styles.contextItem}
                onClick={() => createBreakpoint(scope)}
              >
                <Icon size={16} strokeWidth={1.9} />
                <span className={styles.contextName}>{name}</span>
                <span className={styles.contextHint}>{hint}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className={styles.contextMenu}>
            <div className={styles.contextTitle}>{t('capture.createRuleFromRequest')}</div>
            {contextGroups.map((group) => (
              <div key={group.label}>
                <div className={styles.contextGroup}>{group.label}</div>
                {group.items.map(({ type, icon: Icon, hint }) => (
                  <button
                    key={type}
                    type="button"
                    className={styles.contextItem}
                    onClick={() => createRule(type)}
                    data-automation-id={AutomationIdFactory.captureCreateRule(summary.id, type)}
                    data-parity={type === 'header' ? 'request-rule-header' : undefined}
                  >
                    <Icon size={16} strokeWidth={1.9} />
                    <span className={styles.contextName}>{actionLabels[type]}</span>
                    <span className={styles.contextHint}>{hint}</span>
                  </button>
                ))}
              </div>
            ))}
            <button
              type="button"
              className={styles.contextItem}
              onClick={() => setMenuPage('breakpoint')}
              data-automation-id={AutomationIdFactory.captureCreateRule(summary.id, 'breakpoint')}
              data-parity="request-rule-breakpoint"
            >
              <Pause size={16} strokeWidth={1.9} />
              <span className={styles.contextName}>{t('rules.breakpoint')}</span>
              <span className={styles.contextHint}>{t('breakpoints.pauseNextMatch')}</span>
              <ChevronRight className={styles.contextNext} size={13} strokeWidth={2} />
            </button>
          </div>
        )
      }
      styles={{
        root: {
          padding: 7,
          background: 'var(--panel)',
          border: '1px solid var(--border-2)',
          borderRadius: 12,
          boxShadow: '0 18px 44px rgba(0, 0, 0, 0.2)',
        },
      }}
      menu={{ items: [] }}
    >
      <button
        type="button"
        className={cx(styles.row, selected && styles.selected, pausedPhase && styles.paused)}
        onClick={() => onSelect(summary.id)}
        style={style}
        data-automation-id={AutomationIdFactory.captureRequestRow(summary.id)}
      >
        <span
          className={styles.clientApp}
          data-parity={
            clientAppIcon ? 'capture-list-app-cell' : 'capture-list-app-cell-unknown'
          }
        >
          {clientAppIcon ? (
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
            {summary.host ?? '—'}
          </span>
        </span>
        {pausedPhase ? (
          <span
            className={styles.pausedStatus}
            role="img"
            aria-label={
              pausedPhase === 'response'
                ? t('breakpoints.responsePaused')
                : t('breakpoints.requestPaused')
            }
            title={
              pausedPhase === 'response'
                ? t('breakpoints.responsePaused')
                : t('breakpoints.requestPaused')
            }
          >
            <Pause size={13} strokeWidth={2.2} />
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
          {pausedPhase === 'request'
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
    </Dropdown>
  );
});

