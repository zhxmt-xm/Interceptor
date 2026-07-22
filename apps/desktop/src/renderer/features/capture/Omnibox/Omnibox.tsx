import { Tooltip } from 'antd';
import { Check, ChevronRight, Filter, GitBranch, Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AUTOMATION_IDS, type AutomationId } from '../../../../shared/automation-ids';
import { Count, cx, Flyout, MethodBadge } from '../../../components';
import { useCaptureStore } from '../data/captureStore';
import type { FilterValueOption } from '../interfaces';
import { distinctMethodOptions, distinctStatusOptions, statusKind } from '../utils';
import styles from './Omnibox.module.css';

/** 字段行 hint：有已选显示前 2 个（超出加…），否则预览可选值。 */
function fieldHint(
  selected: readonly (string | number)[],
  optionValues: readonly (string | number)[],
): string {
  const source = selected.length > 0 ? selected : optionValues;
  if (source.length === 0) {
    return '—';
  }
  const head = source.slice(0, 2).join(', ');
  return source.length > 2 ? `${head} …` : head;
}

/** 单条 filter pill：最多显示第一个值，超出用「…」并以 antd Tooltip 展示全部值。 */
function FilterPill({
  values,
  onClear,
  clearLabel,
  automationId,
}: {
  values: readonly (string | number)[];
  onClear: () => void;
  clearLabel: string;
  automationId: AutomationId;
}): React.JSX.Element {
  const overflow = values.length > 1;
  const pill = (
    <span className={styles.pill}>
      {values[0]}
      {overflow ? <span className={styles.pillEllipsis}>…</span> : null}
      <button
        type="button"
        className={styles.pillClose}
        aria-label={clearLabel}
        onClick={onClear}
        data-automation-id={automationId}
      >
        <X size={10} strokeWidth={2.2} />
      </button>
    </span>
  );
  return overflow ? (
    <Tooltip title={values.join(', ')} placement="bottom">
      {pill}
    </Tooltip>
  ) : (
    pill
  );
}

/** 一级字段行 + 点击右侧浮出的多选子面板（1:1 还原设计稿 ADD FILTER）。 */
function FieldRow<T extends string | number>({
  icon,
  name,
  hint,
  options,
  selected,
  onToggle,
  renderValue,
  automationId,
  open,
  onToggleOpen,
}: {
  icon: React.ReactNode;
  name: string;
  hint: string;
  options: readonly FilterValueOption<T>[];
  selected: readonly T[];
  onToggle: (value: T) => void;
  renderValue: (value: T) => React.ReactNode;
  automationId: AutomationId;
  open: boolean;
  onToggleOpen: () => void;
}): React.JSX.Element {
  return (
    <div className={styles.fieldRow}>
      <button
        type="button"
        className={cx(styles.fieldTrigger, open && styles.fieldTriggerOpen)}
        onClick={onToggleOpen}
        aria-expanded={open}
        data-automation-id={automationId}
      >
        {icon}
        <span className={styles.fieldName}>{name}</span>
        <span className={styles.fieldHint}>{hint}</span>
        <ChevronRight className={styles.fieldChevron} size={14} strokeWidth={2} />
      </button>
      {open ? (
        <div className={styles.submenu}>
          {options.map((option) => {
            const checked = selected.includes(option.value);
            return (
              <button
                key={option.value}
                type="button"
                className={styles.option}
                onClick={() => onToggle(option.value)}
              >
                <span className={cx(styles.checkbox, checked && styles.checkboxOn)}>
                  {checked ? <Check size={11} strokeWidth={3} /> : null}
                </span>
                {renderValue(option.value)}
                <span className={styles.optionSpacer} />
                <Count>{option.count}</Count>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/** Search/filter omnibox：关键词搜索 + method/status 多选级联（antd Popover 底座，值取自当前列表）。 */
export function Omnibox(): React.JSX.Element {
  const { t } = useTranslation();
  const [showFilter, setShowFilter] = useState(false);
  const [activeField, setActiveField] = useState<'method' | 'status' | null>(null);
  const search = useCaptureStore((state) => state.filter.search);
  const method = useCaptureStore((state) => state.filter.method);
  const status = useCaptureStore((state) => state.filter.status);
  const rows = useCaptureStore((state) => state.rows);
  const setSearch = useCaptureStore((state) => state.setSearch);
  const setStructuredFilter = useCaptureStore((state) => state.setStructuredFilter);

  const methodOptions = useMemo(() => distinctMethodOptions(rows), [rows]);
  const statusOptions = useMemo(() => distinctStatusOptions(rows), [rows]);
  const noFilterData = methodOptions.length === 0 && statusOptions.length === 0;

  const toggleMethod = (value: string): void => {
    setStructuredFilter({
      method: method.includes(value)
        ? method.filter((item) => item !== value)
        : [...method, value],
    });
  };
  const toggleStatus = (value: number): void => {
    setStructuredFilter({
      status: status.includes(value)
        ? status.filter((item) => item !== value)
        : [...status, value],
    });
  };

  const clearAll = (): void => {
    setStructuredFilter({ method: [], status: [] });
    setSearch('');
  };

  return (
    <div className={styles.omnibox}>
      <span className={styles.searchArea}>
        <Search className={styles.searchIcon} size={14} strokeWidth={1.9} />
      </span>
      {method.length > 0 ? (
        <FilterPill
          values={method}
          onClear={() => setStructuredFilter({ method: [] })}
          clearLabel={`${t('capture.clear')} ${t('capture.method')}`}
          automationId={AUTOMATION_IDS.capture.filterRemove.method}
        />
      ) : null}
      {status.length > 0 ? (
        <FilterPill
          values={status}
          onClear={() => setStructuredFilter({ status: [] })}
          clearLabel={`${t('capture.clear')} ${t('capture.status')}`}
          automationId={AUTOMATION_IDS.capture.filterRemove.status}
        />
      ) : null}
      <input
        className={styles.input}
        type="text"
        value={search}
        placeholder={t('capture.filterRequests')}
        onChange={(event) => setSearch(event.target.value)}
        aria-label={t('capture.filterRequests')}
        data-automation-id={AUTOMATION_IDS.capture.keywordFilter}
      />
      <span className={styles.omniActions}>
      <Flyout
        open={showFilter && !noFilterData}
        onOpenChange={(open) => {
          setShowFilter(open);
          if (!open) {
            setActiveField(null);
          }
        }}
        placement="bottomRight"
        className={styles.popover}
        content={
          <>
            <div className={styles.popoverTitle}>{t('capture.addFilter')}</div>
            <FieldRow
              icon={<GitBranch size={16} strokeWidth={1.9} />}
              name={t('capture.method')}
              hint={fieldHint(method, methodOptions.map((option) => option.value))}
              options={methodOptions}
              selected={method}
              onToggle={toggleMethod}
              renderValue={(value) => <MethodBadge method={value} />}
              automationId={AUTOMATION_IDS.capture.filterOption.method}
              open={activeField === 'method'}
              onToggleOpen={() =>
                setActiveField((current) => (current === 'method' ? null : 'method'))}
            />
            <FieldRow
              icon={<span className={styles.fieldDot} />}
              name={t('capture.status')}
              hint={fieldHint(status, statusOptions.map((option) => option.value))}
              options={statusOptions}
              selected={status}
              onToggle={toggleStatus}
              renderValue={(value) => (
                <span className={cx(styles.statusValue, styles[statusKind(value)])}>
                  <span className={styles.statusDot} />
                  {value}
                </span>
              )}
              automationId={AUTOMATION_IDS.capture.filterOption.status}
              open={activeField === 'status'}
              onToggleOpen={() =>
                setActiveField((current) => (current === 'status' ? null : 'status'))}
            />
          </>
        }
      >
        <button
          type="button"
          className={cx(styles.filterButton, showFilter && styles.active)}
          aria-label={t('capture.addFilter')}
          disabled={noFilterData}
          data-automation-id={AUTOMATION_IDS.capture.addFilter}
        >
          <Filter size={16} strokeWidth={1.9} />
        </button>
      </Flyout>
      <Tooltip title={t('capture.clear')} mouseEnterDelay={0.4}>
        <button
          type="button"
          className={styles.clearButton}
          aria-label={t('capture.clear')}
          onClick={clearAll}
          data-automation-id={AUTOMATION_IDS.capture.clearFilters}
        >
          <X size={15} strokeWidth={2} />
        </button>
      </Tooltip>
      </span>
    </div>
  );
}

