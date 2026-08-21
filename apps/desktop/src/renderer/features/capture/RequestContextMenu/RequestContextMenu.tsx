import { Dropdown, type MenuProps } from 'antd';
import {
  Ban,
  Clock,
  Code,
  Crosshair,
  FileText,
  GitBranch,
  Globe,
  MapPin,
  Pause,
  Reply,
  Settings2,
  type LucideIcon,
} from 'lucide-react';
import { type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import type {
  CaptureExchangeSummary,
  RuleActionType,
} from '../../../../shared/desktop-api';
import {
  AUTOMATION_IDS,
  AutomationIdFactory,
} from '../../../../shared/automation-ids';
import type { BreakpointScope } from '../../rules/interfaces';
import { displayPath } from '../utils';
import styles from './RequestContextMenu.module.css';

export interface RequestContextMenuTarget {
  readonly summary: CaptureExchangeSummary;
}

interface RequestContextMenuProps {
  readonly target: RequestContextMenuTarget | null;
  readonly children: ReactElement;
  readonly onClose: () => void;
  readonly onCreateRule: (
    summary: CaptureExchangeSummary,
    actionType: RuleActionType,
    name: string,
  ) => void;
  readonly onCreateBreakpoint: (
    summary: CaptureExchangeSummary,
    scope: BreakpointScope | 'custom',
    name: string,
  ) => void;
}

interface RuleMenuItem {
  readonly type: RuleActionType;
  readonly icon: LucideIcon;
  readonly hint: string;
}

/** Ant Dropdown owns context-menu positioning, nested hover menus and dismissal. */
export function RequestContextMenu({
  target,
  children,
  onClose,
  onCreateRule,
  onCreateBreakpoint,
}: RequestContextMenuProps): React.JSX.Element {
  const { t } = useTranslation();
  const summary = target?.summary ?? null;
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
  const contextGroups: Array<{ label: string; items: RuleMenuItem[] }> = [
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
      items: [{ type: 'delay', icon: Clock, hint: t('rules.latency') }],
    },
  ];
  const breakpointScopes: Array<{
    scope: BreakpointScope | 'custom';
    icon: LucideIcon;
    name: string;
    hint: string;
  }> = summary ? [
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
  ] : [];

  const label = (
    name: string,
    hint: string,
    parity?: string,
    automationId?: string,
  ): React.JSX.Element => (
    <span
      className={styles.itemLabel}
      data-automation-id={automationId}
      data-parity={parity}
    >
      <span className={styles.itemName}>{name}</span>
      <span className={styles.itemHint}>{hint}</span>
    </span>
  );
  const ruleItem = ({ type, icon: Icon, hint }: RuleMenuItem): NonNullable<MenuProps['items']>[number] => ({
    key: type,
    icon: <Icon size={16} strokeWidth={1.9} />,
    label: label(
      actionLabels[type],
      hint,
      type === 'header' ? 'request-rule-header' : undefined,
      summary ? AutomationIdFactory.captureCreateRule(summary.id, type) : undefined,
    ),
  });
  const items: MenuProps['items'] = [
    {
      key: 'title',
      disabled: true,
      label: (
        <span
          className={styles.title}
          data-automation-id={AUTOMATION_IDS.capture.contextMenu.root}
        >
          {t('capture.createRuleFromRequest')}
        </span>
      ),
    },
    ...contextGroups.map((group) => ({
      key: `group-${group.label}`,
      type: 'group' as const,
      label: <span className={styles.groupLabel}>{group.label}</span>,
      children: group.items.map(ruleItem),
    })),
    {
      key: 'group-control',
      type: 'group',
      label: <span className={styles.groupLabel}>{t('rules.groupControl')}</span>,
      children: [
        ruleItem({ type: 'block', icon: Ban, hint: t('rules.resetClose') }),
        {
          key: 'breakpoint',
          label: (
            <span className={styles.submenuLabel}>
              <Pause size={16} strokeWidth={1.9} />
              {label(
                t('rules.breakpoint'),
                t('breakpoints.pauseNextMatch'),
                'request-rule-breakpoint',
                summary
                  ? AutomationIdFactory.captureCreateRule(summary.id, 'breakpoint')
                  : undefined,
              )}
            </span>
          ),
          popupClassName: styles.breakpointPopup,
          children: [
            {
              key: 'breakpoint-title',
              disabled: true,
              label: (
                <span
                  className={styles.title}
                  data-automation-id={AUTOMATION_IDS.capture.contextMenu.breakpointSubmenu}
                >
                  {t('breakpoints.createFromRequest')}
                </span>
              ),
            },
            ...breakpointScopes.map(({ scope, icon: Icon, name, hint }) => ({
              key: `breakpoint:${scope}`,
              icon: <Icon size={16} strokeWidth={1.9} />,
              label: label(
                name,
                hint,
                undefined,
                summary
                  ? AutomationIdFactory.captureCreateBreakpoint(summary.id, scope)
                  : undefined,
              ),
            })),
          ],
        },
      ],
    },
  ];

  const createFromKey = (key: string): void => {
    if (!summary) return;
    const nameTarget = `${summary.host ?? ''}${displayPath(summary.path, true)}` || summary.method;
    if (key.startsWith('breakpoint:')) {
      const scope = key.slice('breakpoint:'.length) as BreakpointScope | 'custom';
      onCreateBreakpoint(summary, scope, `${t('rules.breakpoint')} · ${nameTarget}`);
      onClose();
      return;
    }
    if (key in actionLabels && key !== 'breakpoint') {
      onCreateRule(summary, key as RuleActionType, `${actionLabels[key as RuleActionType]} · ${nameTarget}`);
      onClose();
    }
  };

  return (
    <Dropdown
      autoAdjustOverflow
      destroyOnHidden
      placement="right"
      trigger={['contextMenu']}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      menu={{
        items,
        selectable: false,
        subMenuCloseDelay: 0.1,
        subMenuOpenDelay: 0,
        triggerSubMenuAction: 'hover',
        onClick: ({ key }) => createFromKey(key),
      }}
    >
      {children}
    </Dropdown>
  );
}
