import { ArrowDown, ArrowUp, Check, MoreHorizontal, Plus, Search, Trash2 } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Flyout, IconButton, MenuItem } from '../../../components';
import { useRulesStore } from '../data/rulesStore';
import { RuleRow } from '../RuleRow/RuleRow';
import { applyRules } from '../data/useRulesData';
import { isRulesDirty } from '../utils';
import styles from './RuleList.module.css';

/** Ordered, toggleable list of rules driven by the rules store. */
export function RuleList(): React.JSX.Element {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const rules = useRulesStore((state) => state.rules);
  const dirty = useRulesStore((state) => isRulesDirty(state.rules, state.applied));
  const saving = useRulesStore((state) => state.saving);
  const selectedId = useRulesStore((state) => state.selectedId);
  const hits = useRulesStore((state) => state.hits);
  const select = useRulesStore((state) => state.select);
  const toggleRule = useRulesStore((state) => state.toggleRule);
  const addRule = useRulesStore((state) => state.addRule);
  const moveRule = useRulesStore((state) => state.moveRule);
  const moveRuleTo = useRulesStore((state) => state.moveRuleTo);
  const removeRule = useRulesStore((state) => state.removeRule);
  const normalizedQuery = query.trim().toLowerCase();
  const visibleRules = useMemo(
    () =>
      normalizedQuery
        ? rules.filter((rule) =>
            rule.name.toLowerCase().includes(normalizedQuery)
            || JSON.stringify(rule.matchers).toLowerCase().includes(normalizedQuery)
            || JSON.stringify(rule.actions).toLowerCase().includes(normalizedQuery))
        : rules,
    [rules, normalizedQuery],
  );
  const selectedIndex = rules.findIndex((rule) => rule.id === selectedId);

  const runSelectedAction = (action: (id: string) => void): void => {
    if (selectedId) {
      action(selectedId);
    }
    setMoreOpen(false);
  };

  // memo 化 RuleRow 需要稳定的 handler 引用：拖拽回调用 useCallback 固定，
  // 仅在 draggedId 变化时重建，避免非拖拽的数据更新（如命中计数轮询）触发全列表 re-render。
  const finishDrag = useCallback((): void => {
    setDraggedId(null);
    setDropTargetId(null);
  }, []);

  const handleDragStart = useCallback(
    (id: string, event: React.DragEvent<HTMLSpanElement>): void => {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', id);
      setDraggedId(id);
    },
    [],
  );

  const handleDragOver = useCallback(
    (id: string, event: React.DragEvent<HTMLButtonElement>): void => {
      if (draggedId && draggedId !== id) {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        setDropTargetId(id);
      }
    },
    [draggedId],
  );

  const handleDrop = useCallback(
    (id: string, event: React.DragEvent<HTMLButtonElement>): void => {
      event.preventDefault();
      if (draggedId && draggedId !== id) {
        moveRuleTo(draggedId, id);
      }
      finishDrag();
    },
    [draggedId, moveRuleTo, finishDrag],
  );

  return (
    <div className={styles.list}>
      <div className={styles.bar}>
        <label className={styles.search}>
          <Search aria-hidden="true" />
          <input
            value={query}
            aria-label={t('rules.searchRules')}
            placeholder={t('rules.searchRules')}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className={styles.actions}>
          <IconButton
            icon={Plus}
            label={t('rules.newRule')}
            size="sm"
            onClick={() => addRule(t('rules.newRuleName'))}
          />
          <IconButton
            icon={Check}
            label={saving ? t('rules.applying') : t('rules.applyChanges')}
            size="sm"
            strokeWidth={2.4}
            disabled={!dirty || saving}
            onClick={() => void applyRules()}
          />
          <Flyout
            open={moreOpen}
            onOpenChange={setMoreOpen}
            placement="bottomRight"
            className={styles.moreMenu}
            content={
              <>
                <MenuItem
                  icon={ArrowUp}
                  name={t('rules.moveUp')}
                  hint="↑"
                  disabled={selectedIndex <= 0}
                  onClick={() => runSelectedAction((id) => moveRule(id, -1))}
                />
                <MenuItem
                  icon={ArrowDown}
                  name={t('rules.moveDown')}
                  hint="↓"
                  disabled={selectedIndex < 0 || selectedIndex >= rules.length - 1}
                  onClick={() => runSelectedAction((id) => moveRule(id, 1))}
                />
                <MenuItem
                  icon={Trash2}
                  name={t('rules.deleteRule')}
                  hint=""
                  onClick={() => runSelectedAction(removeRule)}
                />
              </>
            }
          >
            <span className={styles.menuAnchor}>
              <IconButton
                icon={MoreHorizontal}
                label={t('rules.more')}
                size="sm"
                disabled={selectedIndex < 0}
              />
            </span>
          </Flyout>
        </div>
      </div>

      <div className={styles.rows}>
        {visibleRules.length === 0 ? (
          <div className={styles.empty}>{t('rules.empty')}</div>
        ) : (
          visibleRules.map((rule) => (
            <RuleRow
              key={rule.id}
              rule={rule}
              hits={hits[rule.id] ?? 0}
              selected={rule.id === selectedId}
              reorderable={!normalizedQuery}
              dragging={rule.id === draggedId}
              dropTarget={rule.id === dropTargetId}
              onSelect={select}
              onToggle={toggleRule}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onDragEnd={finishDrag}
            />
          ))
        )}
      </div>
    </div>
  );
}
