import {
  AlertTriangle,
  Ban,
  Check,
  Clock,
  Code,
  FileText,
  Gauge,
  Globe,
  MapPin,
  Pause,
  Plus,
  Reply,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';

import {
  cx,
  IconButton,
  MenuItem,
  SectionHeader,
  StatusBadge,
  Switch,
} from '../../../components';
import type { RuleActionType } from '../../../../shared/desktop-api';
import { ruleIndexFromPath } from '../rule-format';
import { selectedRule, useRulesStore } from '../rulesStore';
import { ActionEditor } from './ActionEditor';
import { MatcherRow } from './MatcherRow';
import styles from './RuleEditor.module.css';

/** Editor for the selected rule: match conditions, actions and validation. */
export function RuleEditor(): React.JSX.Element {
  const [showAddAction, setShowAddAction] = useState(false);
  const rule = useRulesStore(selectedRule);
  const rules = useRulesStore((state) => state.rules);
  const revision = useRulesStore((state) => state.revision);
  const dirty = useRulesStore((state) => state.dirty);
  const diagnostics = useRulesStore((state) => state.diagnostics);
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
        <div className={styles.placeholder}>Select a rule to edit, or add a new one.</div>
      </div>
    );
  }

  const ruleIndex = rules.findIndex((item) => item.id === rule.id);
  const ruleDiagnostics = diagnostics.filter(
    (diagnostic) => ruleIndexFromPath(diagnostic.path) === ruleIndex,
  );

  const addAndClose = (type: RuleActionType): void => {
    addAction(rule.id, type);
    setShowAddAction(false);
  };

  return (
    <div className={styles.editor}>
      <div className={styles.head}>
        <input
          className={styles.nameInput}
          value={rule.name}
          aria-label="Rule name"
          spellCheck={false}
          onChange={(event) => renameRule(rule.id, event.target.value)}
        />
        <StatusBadge>{rule.enabled ? 'Enabled' : 'Disabled'}</StatusBadge>
        <Switch checked={rule.enabled} onChange={() => toggleRule(rule.id)} />
        <IconButton
          icon={Trash2}
          label="Delete rule"
          size="sm"
          onClick={() => removeRule(rule.id)}
        />
      </div>

      <div className={styles.scroll}>
        <div>
          <SectionHeader>Match</SectionHeader>
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
          <button
            type="button"
            className={styles.addButton}
            onClick={() => addMatcher(rule.id, 'host')}
          >
            <Plus size={13} strokeWidth={2} />
            Add condition
          </button>
        </div>

        <div>
          <SectionHeader count={rule.actions.length}>Actions</SectionHeader>
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
          <button
            type="button"
            className={styles.addButton}
            onClick={() => setShowAddAction((value) => !value)}
          >
            <Plus size={13} strokeWidth={2} />
            Add action
          </button>
        </div>

        {ruleDiagnostics.length === 0 ? (
          <div className={styles.validation}>
            <Check size={15} strokeWidth={2} />
            {dirty
              ? 'Compiles cleanly · unsaved — Apply changes to persist'
              : `Compiles cleanly · applied at revision ${revision}`}
          </div>
        ) : (
          <div className={cx(styles.validation, styles.invalid)}>
            <AlertTriangle size={15} strokeWidth={2} />
            <div className={styles.diagList}>
              {ruleDiagnostics.map((diagnostic, index) => (
                <span key={index}>{diagnostic.message}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      {showAddAction ? (
        <div className={styles.popover}>
          <div className={styles.popoverTitle}>Add action</div>
          <MenuItem icon={Code} name="Rewrite header" hint="set / append / remove" onClick={() => addAndClose('header')} />
          <MenuItem icon={Code} name="Rewrite query" hint="set / remove" onClick={() => addAndClose('query')} />
          <MenuItem icon={FileText} name="Rewrite body" hint="text / json" onClick={() => addAndClose('body')} />
          <MenuItem icon={Code} name="Set status" hint="override" onClick={() => addAndClose('status')} />
          <MenuItem icon={Reply} name="Synthetic" hint="return response" onClick={() => addAndClose('synthetic')} />
          <MenuItem icon={MapPin} name="Map Local" hint="serve file" onClick={() => addAndClose('map-local')} />
          <MenuItem icon={Globe} name="Map Remote" hint="reroute" onClick={() => addAndClose('map-remote')} />
          <MenuItem icon={Ban} name="Block" hint="reset / close" onClick={() => addAndClose('block')} />
          <MenuItem icon={Clock} name="Delay" hint="latency" onClick={() => addAndClose('delay')} />
          <MenuItem icon={Gauge} name="Throttle" hint="bandwidth" onClick={() => addAndClose('throttle')} />
          <MenuItem icon={Pause} name="Breakpoint" hint="pause & edit" onClick={() => addAndClose('breakpoint')} />
        </div>
      ) : null}
    </div>
  );
}
