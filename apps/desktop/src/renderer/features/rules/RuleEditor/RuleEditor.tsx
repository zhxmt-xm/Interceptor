import {
  AlertTriangle,
  Ban,
  Check,
  Clock,
  Code,
  FileText,
  Filter,
  Globe,
  MapPin,
  Pause,
  Plus,
  Reply,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  cx,
  Flyout,
  IconButton,
  MenuItem,
  SectionHeader,
  StatusBadge,
  Switch,
} from '../../../components';
import type { RuleActionType, RuleMatcherType } from '../../../../shared/desktop-api';
import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
import { useRulesStore } from '../data/rulesStore';
import { isRulesDirty, ruleIssues, selectedRule } from '../utils';
import { ActionEditor } from './ActionEditor';
import { MatcherRow } from './MatcherRow';
import styles from './RuleEditor.module.css';

/** 决定“请求最终归宿”的互斥 action：本地响应/转发/合成响应/阻断，一个规则最多一个。 */
const ORIGIN_ACTIONS: RuleActionType[] = ['map-local', 'map-remote', 'synthetic', 'block'];

export interface RuleEditorProps {
  onShowRuleRequests: (ruleId: string) => void;
}

/** Editor for the selected rule: match conditions, actions and validation. */
export function RuleEditor({ onShowRuleRequests }: RuleEditorProps): React.JSX.Element {
  const { t } = useTranslation();
  const [showAddCondition, setShowAddCondition] = useState(false);
  const [showAddAction, setShowAddAction] = useState(false);
  const rule = useRulesStore(selectedRule);
  const rules = useRulesStore((state) => state.rules);
  const revision = useRulesStore((state) => state.revision);
  const dirty = useRulesStore((state) => isRulesDirty(state.rules, state.applied));
  const renameRule = useRulesStore((state) => state.renameRule);
  const toggleRule = useRulesStore((state) => state.toggleRule);
  const removeRule = useRulesStore((state) => state.removeRule);
  const addMatcher = useRulesStore((state) => state.addMatcher);
  const updateMatcher = useRulesStore((state) => state.updateMatcher);
  const removeMatcher = useRulesStore((state) => state.removeMatcher);
  const addAction = useRulesStore((state) => state.addAction);
  const updateAction = useRulesStore((state) => state.updateAction);
  const removeAction = useRulesStore((state) => state.removeAction);

  if (!rule) {
    return (
      <div className={styles.editor}>
        <div className={styles.placeholder}>{t('rules.selectRule')}</div>
      </div>
    );
  }

  const ruleIndex = rules.findIndex((item) => item.id === rule.id);
  const issues = ruleIssues(rule);

  const addAndClose = (type: RuleActionType): void => {
    addAction(rule.id, type);
    setShowAddAction(false);
  };

  const addConditionAndClose = (type: RuleMatcherType): void => {
    addMatcher(rule.id, type);
    setShowAddCondition(false);
  };

  // “请求归宿”互斥：已存在其一时，其余在 Add action 菜单里标记 conflict 并禁用。
  const existingOrigin = rule.actions.find((action) => ORIGIN_ACTIONS.includes(action.type))?.type;
  const originItem = (type: RuleActionType, defaultHint: string) =>
    existingOrigin === undefined
      ? { hint: defaultHint }
      : existingOrigin === type
        ? { hint: t('rules.added'), tag: true, disabled: true }
        : { hint: t('rules.conflict'), tag: true, warn: true, disabled: true };

  return (
    <div className={styles.editor}>
      <div className={styles.head}>
        <input
          className={styles.nameInput}
          value={rule.name}
          aria-label={t('rules.ruleName')}
          spellCheck={false}
          onChange={(event) => renameRule(rule.id, event.target.value)}
        />
        <StatusBadge>{rule.enabled ? t('rules.enabled') : t('rules.disabled')}</StatusBadge>
        <Switch checked={rule.enabled} onChange={() => toggleRule(rule.id)} />
        <IconButton
          icon={Filter}
          label={t('rules.showMatchingRequests')}
          size="sm"
          onClick={() => onShowRuleRequests(rule.id)}
          automationId={AUTOMATION_IDS.rules.showMatchingRequests}
        />
        <IconButton
          icon={Trash2}
          label={t('rules.deleteRule')}
          size="sm"
          onClick={() => removeRule(rule.id)}
        />
      </div>

      <div className={styles.scroll}>
        <div>
          <SectionHeader>{t('rules.match')}</SectionHeader>
          <div className={styles.matchRows}>
            {rule.matchers.map((matcher, index) => (
              <MatcherRow
                key={index}
                matcher={matcher}
                first={index === 0}
                onChange={(next) => updateMatcher(rule.id, index, next)}
                onRemove={() => removeMatcher(rule.id, index)}
              />
            ))}
          </div>
          <Flyout
            open={showAddCondition}
            onOpenChange={(next) => {
              setShowAddCondition(next);
              if (next) {
                setShowAddAction(false);
              }
            }}
            placement="right"
            className={styles.conditionMenu}
            content={
              <>
                <MenuItem icon={Code} name={t('rules.matcher.method')} hint="GET" onClick={() => addConditionAndClose('method')} />
                <MenuItem icon={Globe} name={t('rules.matcher.host')} hint="*.example.com" onClick={() => addConditionAndClose('host')} />
                <MenuItem icon={MapPin} name={t('rules.matcher.path')} hint="/v1/users" onClick={() => addConditionAndClose('path')} />
                <MenuItem icon={Globe} name={t('rules.matcher.url')} hint="https://…" onClick={() => addConditionAndClose('url')} />
                <MenuItem icon={Code} name={t('rules.matcher.query')} hint="key=value" onClick={() => addConditionAndClose('query')} />
                <MenuItem icon={FileText} name={t('rules.matcher.header')} hint="name: value" onClick={() => addConditionAndClose('header')} />
                <MenuItem icon={Reply} name={t('rules.matcher.status')} hint="200–299" onClick={() => addConditionAndClose('status')} />
                <MenuItem icon={FileText} name={t('rules.matcher.mime')} hint="application/json" onClick={() => addConditionAndClose('mime')} />
              </>
            }
          >
            <button
              type="button"
              className={styles.addButton}
            >
              <Plus size={13} strokeWidth={2} />
              {t('rules.addCondition')}
            </button>
          </Flyout>
        </div>

        <div>
          <SectionHeader count={rule.actions.length}>{t('rules.actions')}</SectionHeader>
          <div className={styles.actionCards}>
            {rule.actions.map((action, index) => (
              <ActionEditor
                key={index}
                action={action}
                onChange={(next) => updateAction(rule.id, index, next)}
                onRemove={() => removeAction(rule.id, index)}
              />
            ))}
          </div>
          <Flyout
            open={showAddAction}
            onOpenChange={(next) => {
              setShowAddAction(next);
              if (next) {
                setShowAddCondition(false);
              }
            }}
            placement="right"
            className={styles.popover}
            content={
              <>
                <div className={styles.popoverGroup}>{t('rules.groupRewrite')}</div>
                <MenuItem icon={Code} name={t('rules.rewriteHeader')} hint={t('rules.rewriteHeaderHint')} onClick={() => addAndClose('header')} />
                <MenuItem icon={Code} name={t('rules.rewriteQuery')} hint={t('rules.rewriteQueryHint')} onClick={() => addAndClose('query')} />
                <MenuItem icon={FileText} name={t('rules.rewriteBody')} hint={t('rules.rewriteBodyHint')} onClick={() => addAndClose('body')} />
                <MenuItem icon={Code} name={t('rules.setStatus')} hint={t('rules.override')} onClick={() => addAndClose('status')} />
                <div className={styles.popoverGroup}>{t('rules.groupMap')}</div>
                <MenuItem icon={MapPin} name={t('rules.mapLocal')} {...originItem('map-local', t('rules.serveFile'))} onClick={() => addAndClose('map-local')} />
                <MenuItem icon={Globe} name={t('rules.mapRemote')} {...originItem('map-remote', t('rules.reroute'))} onClick={() => addAndClose('map-remote')} />
                <MenuItem icon={Reply} name={t('rules.synthetic')} {...originItem('synthetic', t('rules.returnResponse'))} onClick={() => addAndClose('synthetic')} />
                <div className={styles.popoverGroup}>{t('rules.groupTraffic')}</div>
                <MenuItem icon={Clock} name={t('rules.delay')} hint={t('rules.latency')} onClick={() => addAndClose('delay')} />
                <div className={styles.popoverGroup}>{t('rules.groupControl')}</div>
                <MenuItem icon={Ban} name={t('rules.block')} {...originItem('block', t('rules.resetClose'))} onClick={() => addAndClose('block')} />
                <MenuItem icon={Pause} name={t('rules.breakpoint')} hint={t('rules.pauseEdit')} onClick={() => addAndClose('breakpoint')} />
              </>
            }
          >
            <button
              type="button"
              className={styles.addButton}
            >
              <Plus size={13} strokeWidth={2} />
              {t('rules.addAction')}
            </button>
          </Flyout>
        </div>

        {issues.length === 0 ? (
          <div className={styles.validation}>
            <Check size={15} strokeWidth={2} />
            {dirty
              ? t('rules.compilesUnsaved')
              : t('rules.compilesApplied', { revision })}
          </div>
        ) : (
          <div className={cx(styles.validation, styles.invalid)}>
            <AlertTriangle size={15} strokeWidth={2} />
            <div className={styles.diagList}>
              {issues.map((issue, index) => (
                <span key={index}>{t(issue.messageKey, { index: issue.index })}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
