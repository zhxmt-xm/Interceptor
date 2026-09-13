import { collectLeaves } from '@interceptor/core-protocol';
import { ArrowRight, Crosshair, GitBranch, SlidersVertical, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
import { Button, cx, IconButton, Switch } from '../../../components';
import { useBreakpointsStore } from '../../breakpoints';
import { setBreakOnMatch } from '../../breakpoints/data/useBreakpoints';
import { useRulesStore } from '../../rules/data/rulesStore';
import { toggleBreakpointRule } from '../../rules/data/useRulesData';
import { breakpointManagerSummary } from '../utils';
import styles from './BreakpointManager.module.css';

interface BreakpointManagerProps {
  /** 打开 Rules 工作区并选中一条规则。 */
  onOpenRule: (ruleId: string) => void;
  /** 打开 Rules 工作区做多条件、method 限定与超时策略等精细编辑。 */
  onOpenAdvanced: () => void;
  onClose: () => void;
}

/**
 * Capture 工具栏里的断点控制面：全局开关 + 断点规则清单。
 *
 * 这里只展示能直接操作的东西——名称、匹配摘要、跳转和启用开关。
 * 阶段、超时策略这类需要完整编辑器才能改的属性一律走 `Advanced rules`。
 */
export function BreakpointManager({
  onOpenRule,
  onOpenAdvanced,
  onClose,
}: BreakpointManagerProps): React.JSX.Element {
  const { t } = useTranslation();
  const nodes = useRulesStore((state) => state.nodes);
  const enabled = useBreakpointsStore((state) => state.enabled);
  const pausedCount = useBreakpointsStore((state) => state.breakpoints.length);

  const breakpointRules = collectLeaves(nodes).filter((rule) =>
    rule.actions.some((action) => action.type === 'breakpoint'));
  const enabledCount = breakpointRules.filter((rule) => rule.enabled).length;

  return (
    <div className={styles.manager} role="dialog" aria-label={t('breakpoints.managerTitle')}>
      <header className={styles.head}>
        <div className={styles.title}>
          <b>{t('breakpoints.title')}</b>
          <span>
            {t('breakpoints.managerCounts', { enabled: enabledCount, paused: pausedCount })}
          </span>
        </div>
        <div className={styles.mode}>
          <span>{t('breakpoints.breakOnMatch')}</span>
          <Switch
            checked={enabled}
            label={t('breakpoints.breakOnMatch')}
            onChange={(next) => void setBreakOnMatch(next)}
            className={styles.compactSwitch}
            automationId={AUTOMATION_IDS.breakpoints.toggle}
          />
        </div>
        <Button icon={SlidersVertical} size="sm" onClick={onOpenAdvanced}>
          {t('breakpoints.advancedRules')}
        </Button>
        <IconButton icon={X} size="sm" label={t('common.close')} onClick={onClose} />
      </header>

      <div className={styles.label}>{t('breakpoints.rulesLabel')}</div>
      {breakpointRules.length === 0 ? (
        <div className={styles.empty}>{t('breakpoints.noRules')}</div>
      ) : (
        breakpointRules.map((rule) => {
          const pausesRequests = rule.actions.some(
            (action) => action.type === 'breakpoint' && action.phase === 'request',
          );

          return (
            <div
              key={rule.id}
              className={cx(styles.rule, !rule.enabled && styles.ruleOff)}
            >
              <span className={styles.ruleIcon}>
                {pausesRequests
                  ? <Crosshair size={13} strokeWidth={1.9} />
                  : <GitBranch size={13} strokeWidth={1.9} />}
              </span>
              <div className={styles.ruleCopy}>
                <b>{rule.name}</b>
                <code>{breakpointManagerSummary(rule)}</code>
              </div>
              <button
                type="button"
                className={styles.ruleOpen}
                onClick={() => onOpenRule(rule.id)}
              >
                {t('breakpoints.viewRule')}
                <ArrowRight size={11} strokeWidth={2} />
              </button>
              <Switch
                checked={rule.enabled}
                label={t('breakpoints.enableRule', { name: rule.name })}
                onChange={() => void toggleBreakpointRule(rule.id)}
                className={styles.compactSwitch}
              />
            </div>
          );
        })
      )}
    </div>
  );
}
