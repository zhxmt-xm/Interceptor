import {
  Ban,
  Clock,
  Code,
  FileText,
  Filter,
  Globe,
  HelpCircle,
  MapPin,
  Pause,
  Plus,
  Reply,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { Tooltip } from 'antd';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  Button,
  Flyout,
  IconButton,
  MenuItem,
  SectionHeader,
  StatusBadge,
  Switch,
} from '../../../components';
import type { RuleActionType, RuleMatcherType } from '../../../../shared/desktop-api';
import { AUTOMATION_IDS, AutomationIdFactory } from '../../../../shared/automation-ids';
import { useRulesStore } from '../data/rulesStore';
import { applyRules, loadRules } from '../data/useRulesData';
import { isRuleComplete, isRulesDirty, selectedRule } from '../utils';
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
  const dirty = useRulesStore((state) => isRulesDirty(state.nodes, state.applied));
  const saving = useRulesStore((state) => state.saving);
  const conflict = useRulesStore((state) => state.conflict);
  const hits = useRulesStore((state) => state.hits);
  const renameNode = useRulesStore((state) => state.renameNode);
  const toggleRule = useRulesStore((state) => state.toggleRule);
  const removeNode = useRulesStore((state) => state.removeNode);
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

  const matchedRequests = hits[rule.id] ?? 0;
  const enableBlocked = !rule.enabled && !isRuleComplete(rule);

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
          data-automation-id={AUTOMATION_IDS.rules.editorName}
          spellCheck={false}
          onChange={(event) => renameNode(rule.id, event.target.value)}
        />
        <StatusBadge>{rule.enabled ? t('rules.enabled') : t('rules.disabled')}</StatusBadge>
        <Switch
          checked={rule.enabled}
          disabled={enableBlocked}
          automationId={AUTOMATION_IDS.rules.editorEnabled}
          onChange={() => toggleRule(rule.id)}
        />
        <IconButton
          icon={Filter}
          label={
            matchedRequests === 0
              ? t('rules.noMatchingRequests')
              : t('rules.showMatchingRequests')
          }
          size="sm"
          disabled={matchedRequests === 0}
          onClick={() => onShowRuleRequests(rule.id)}
          automationId={AUTOMATION_IDS.rules.showMatchingRequests}
        />
        <Tooltip
          placement="bottomRight"
          title={
            <div className={styles.scopeHelp}>
              <b>{t('rules.scopeTitle')}</b>
              <span>{t('rules.scopeHttps')}</span>
              <span>{t('rules.scopeWebSocket')}</span>
            </div>
          }
        >
          {/* IconButton 自带 Tooltip 只支持纯文本，此处需要多行说明。 */}
          <span className={styles.scopeHelpAnchor}>
            <IconButton
              icon={HelpCircle}
              label={t('rules.scopeTitle')}
              size="sm"
              tooltip={null}
            />
          </span>
        </Tooltip>
        <IconButton
          icon={Trash2}
          label={t('rules.deleteRule')}
          size="sm"
          onClick={() => removeNode(rule.id)}
        />
        {conflict ? (
          <IconButton
            icon={RotateCcw}
            label={t('rules.reloadFromCore')}
            size="sm"
            strokeWidth={2.4}
            onClick={() => void loadRules()}
            automationId={AUTOMATION_IDS.rules.reload}
          />
        ) : null}
        <Button
          variant="primary"
          size="sm"
          disabled={!dirty || saving}
          onClick={() => void applyRules()}
          automationId={AUTOMATION_IDS.rules.apply}
        >
          {saving ? t('rules.applying') : t('rules.save')}
        </Button>
      </div>

      <div className={styles.scroll}>
        <div>
          <SectionHeader>{t('rules.match')}</SectionHeader>
          <div className={styles.matchRows}>
            {rule.matchers.map((matcher, index) => (
              <MatcherRow
                key={index}
                ruleId={rule.id}
                index={index}
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
                <MenuItem automationId={AUTOMATION_IDS.rules.conditionOption.method} icon={Code} name={t('rules.matcher.method')} hint="GET" onClick={() => addConditionAndClose('method')} />
                <MenuItem automationId={AUTOMATION_IDS.rules.conditionOption.host} icon={Globe} name={t('rules.matcher.host')} hint="*.example.com" onClick={() => addConditionAndClose('host')} />
                <MenuItem automationId={AUTOMATION_IDS.rules.conditionOption.path} icon={MapPin} name={t('rules.matcher.path')} hint="/v1/users" onClick={() => addConditionAndClose('path')} />
                <MenuItem automationId={AUTOMATION_IDS.rules.conditionOption.url} icon={Globe} name={t('rules.matcher.url')} hint="https://…" onClick={() => addConditionAndClose('url')} />
                <MenuItem automationId={AUTOMATION_IDS.rules.conditionOption.query} icon={Code} name={t('rules.matcher.query')} hint="key=value" onClick={() => addConditionAndClose('query')} />
                <MenuItem automationId={AUTOMATION_IDS.rules.conditionOption.header} icon={FileText} name={t('rules.matcher.header')} hint="name: value" onClick={() => addConditionAndClose('header')} />
                <MenuItem automationId={AUTOMATION_IDS.rules.conditionOption.status} icon={Reply} name={t('rules.matcher.status')} hint="200–299" onClick={() => addConditionAndClose('status')} />
                <MenuItem automationId={AUTOMATION_IDS.rules.conditionOption.mime} icon={FileText} name={t('rules.matcher.mime')} hint="application/json" onClick={() => addConditionAndClose('mime')} />
              </>
            }
          >
            <button
              type="button"
              className={styles.addButton}
              data-automation-id={AUTOMATION_IDS.rules.addCondition}
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
                ruleId={rule.id}
                index={index}
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
                <MenuItem automationId={AUTOMATION_IDS.rules.actionOption.header} icon={Code} name={t('rules.rewriteHeader')} hint={t('rules.rewriteHeaderHint')} onClick={() => addAndClose('header')} />
                <MenuItem automationId={AUTOMATION_IDS.rules.actionOption.query} icon={Code} name={t('rules.rewriteQuery')} hint={t('rules.rewriteQueryHint')} onClick={() => addAndClose('query')} />
                <MenuItem automationId={AUTOMATION_IDS.rules.actionOption.body} icon={FileText} name={t('rules.rewriteBody')} hint={t('rules.rewriteBodyHint')} onClick={() => addAndClose('body')} />
                <MenuItem automationId={AUTOMATION_IDS.rules.actionOption.status} icon={Code} name={t('rules.setStatus')} hint={t('rules.override')} onClick={() => addAndClose('status')} />
                <div className={styles.popoverGroup}>{t('rules.groupMap')}</div>
                <MenuItem automationId={AUTOMATION_IDS.rules.actionOption.mapLocal} icon={MapPin} name={t('rules.mapLocal')} {...originItem('map-local', t('rules.serveFile'))} onClick={() => addAndClose('map-local')} />
                <MenuItem automationId={AUTOMATION_IDS.rules.actionOption.mapRemote} icon={Globe} name={t('rules.mapRemote')} {...originItem('map-remote', t('rules.reroute'))} onClick={() => addAndClose('map-remote')} />
                <MenuItem automationId={AUTOMATION_IDS.rules.actionOption.synthetic} icon={Reply} name={t('rules.synthetic')} {...originItem('synthetic', t('rules.returnResponse'))} onClick={() => addAndClose('synthetic')} />
                <div className={styles.popoverGroup}>{t('rules.groupTraffic')}</div>
                <MenuItem automationId={AUTOMATION_IDS.rules.actionOption.delay} icon={Clock} name={t('rules.delay')} hint={t('rules.latency')} onClick={() => addAndClose('delay')} />
                <div className={styles.popoverGroup}>{t('rules.groupControl')}</div>
                <MenuItem automationId={AUTOMATION_IDS.rules.actionOption.block} icon={Ban} name={t('rules.block')} {...originItem('block', t('rules.resetClose'))} onClick={() => addAndClose('block')} />
                <MenuItem automationId={AUTOMATION_IDS.rules.actionOption.breakpoint} icon={Pause} name={t('rules.breakpoint')} hint={t('rules.pauseEdit')} onClick={() => addAndClose('breakpoint')} />
              </>
            }
          >
            <button
              type="button"
              className={styles.addButton}
              data-automation-id={AUTOMATION_IDS.rules.addAction}
            >
              <Plus size={13} strokeWidth={2} />
              {t('rules.addAction')}
            </button>
          </Flyout>
        </div>

      </div>
    </div>
  );
}
