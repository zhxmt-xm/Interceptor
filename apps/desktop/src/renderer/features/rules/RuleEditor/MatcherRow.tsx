import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cx, IconButton, InputBox, Select } from '../../../components';
import type {
  RuleMatcher,
  RuleMatcherType,
  RulePhase,
} from '../../../../shared/desktop-api';
import { MATCHER_TYPE_OPTIONS, PHASE_OPTIONS } from '../constants';
import { createMatcher, localizeOptions } from '../utils';
import styles from './MatcherRow.module.css';

/** 匹配方式（与 StringMatchMode/KeyMatchMode 共用值域）。 */
type MatchToggleMode = 'contains' | 'exact' | 'regex';

/** value 输入框右侧的匹配开关：区分大小写、精确相等（默认关＝包含）、正则（精确/正则互斥）。 */
function ModeToggles({
  mode,
  caseSensitive,
  onModeChange,
  onCaseToggle,
  t,
}: {
  mode: MatchToggleMode;
  caseSensitive: boolean;
  onModeChange: (mode: MatchToggleMode) => void;
  onCaseToggle: () => void;
  t: (key: string) => string;
}): React.JSX.Element {
  return (
    <div className={styles.modeToggles}>
      <button
        type="button"
        className={cx(styles.toggle, caseSensitive && styles.toggleOn)}
        aria-pressed={caseSensitive}
        title={t('rules.caseSensitive')}
        onClick={onCaseToggle}
      >
        Aa
      </button>
      <button
        type="button"
        className={cx(styles.toggle, mode === 'exact' && styles.toggleOn)}
        aria-pressed={mode === 'exact'}
        title={t('rules.exactMatch')}
        onClick={() => onModeChange(mode === 'exact' ? 'contains' : 'exact')}
      >
        <u>ab</u>
      </button>
      <button
        type="button"
        className={cx(styles.toggle, mode === 'regex' && styles.toggleOn)}
        aria-pressed={mode === 'regex'}
        title={t('rules.regexMatch')}
        onClick={() => onModeChange(mode === 'regex' ? 'contains' : 'regex')}
      >
        .*
      </button>
    </div>
  );
}

export interface MatcherRowProps {
  matcher: RuleMatcher;
  first: boolean;
  onChange: (matcher: RuleMatcher) => void;
  onRemove: () => void;
}

function toInt(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** 单条匹配条件行：字段类型 + 按类型渲染的受控控件（值/名一律自由输入，模式为枚举）。 */
export function MatcherRow({
  matcher,
  first,
  onChange,
  onRemove,
}: MatcherRowProps): React.JSX.Element {
  const { t } = useTranslation();
  const translate = (key: string): string => t(key);
  return (
    <div className={styles.row}>
      <span className={styles.conn}>{first ? t('rules.if') : t('rules.and')}</span>
      <Select
        className={styles.type}
        ariaLabel={t('rules.conditionField')}
        value={matcher.type}
        options={localizeOptions(MATCHER_TYPE_OPTIONS, 'rules.matcher', translate)}
        onValueChange={(value) => onChange(createMatcher(value as RuleMatcherType))}
      />
      {renderControls(matcher, onChange, translate)}
      <IconButton
        className={styles.remove}
        icon={X}
        label={t('rules.removeCondition')}
        size="sm"
        strokeWidth={2.2}
        onClick={onRemove}
      />
    </div>
  );
}

function renderControls(
  matcher: RuleMatcher,
  onChange: (matcher: RuleMatcher) => void,
  translate: (key: string) => string,
): React.JSX.Element {
  switch (matcher.type) {
    case 'method':
      return (
        <InputBox
          className={styles.value}
          ariaLabel={translate('rules.method')}
          value={matcher.value}
          placeholder="GET"
          onValueChange={(value) => onChange({ type: 'method', value })}
        />
      );
    case 'host':
    case 'path':
    case 'url': {
      const current = matcher;
      const placeholder =
        current.type === 'host'
          ? 'api.example.com'
          : current.type === 'path'
            ? '/v1/users'
            : 'https://example.com/…';
      return (
        <InputBox
          className={styles.value}
          ariaLabel={translate('rules.value')}
          value={current.value}
          placeholder={placeholder}
          onValueChange={(value) => onChange({ ...current, value })}
          trailing={
            <ModeToggles
              mode={current.mode}
              caseSensitive={current.caseSensitive ?? false}
              onModeChange={(mode) => onChange({ ...current, mode })}
              onCaseToggle={() => onChange({ ...current, caseSensitive: !(current.caseSensitive ?? false) })}
              t={translate}
            />
          }
        />
      );
    }
    case 'query': {
      const current = matcher;
      return (
        <>
          <InputBox
            className={styles.key}
            ariaLabel={translate('rules.queryKey')}
            value={current.key}
            placeholder="key"
            onValueChange={(key) => onChange({ ...current, key })}
          />
          <InputBox
            className={styles.value}
            ariaLabel={translate('rules.value')}
            value={current.value ?? ''}
            placeholder={translate('rules.valueOptional')}
            onValueChange={(value) => onChange({ ...current, value })}
            trailing={
              <ModeToggles
                mode={current.mode}
                caseSensitive={current.caseSensitive ?? false}
                onModeChange={(mode) => onChange({ ...current, mode })}
                onCaseToggle={() => onChange({ ...current, caseSensitive: !(current.caseSensitive ?? false) })}
                t={translate}
              />
            }
          />
        </>
      );
    }
    case 'header': {
      const current = matcher;
      return (
        <>
          <Select
            className={styles.phase}
            ariaLabel={translate('rules.phase')}
            value={current.phase}
            options={localizeOptions(PHASE_OPTIONS, 'rules.phase', translate)}
            onValueChange={(phase) => onChange({ ...current, phase: phase as RulePhase })}
          />
          <InputBox
            className={styles.key}
            ariaLabel={translate('rules.headerName')}
            value={current.name}
            placeholder="content-type"
            onValueChange={(name) => onChange({ ...current, name })}
          />
          <InputBox
            className={styles.value}
            ariaLabel={translate('rules.value')}
            value={current.value ?? ''}
            placeholder={translate('rules.valueOptional')}
            onValueChange={(value) => onChange({ ...current, value })}
            trailing={
              <ModeToggles
                mode={current.mode}
                caseSensitive={current.caseSensitive ?? false}
                onModeChange={(mode) => onChange({ ...current, mode })}
                onCaseToggle={() => onChange({ ...current, caseSensitive: !(current.caseSensitive ?? false) })}
                t={translate}
              />
            }
          />
        </>
      );
    }
    case 'status': {
      const current = matcher;
      return (
        <>
          <InputBox
            className={styles.num}
            ariaLabel={translate('rules.minStatus')}
            type="number"
            value={String(current.min)}
            onValueChange={(value) => onChange({ ...current, min: toInt(value, current.min) })}
          />
          <span className={styles.sep}>{translate('rules.to')}</span>
          <InputBox
            className={styles.num}
            ariaLabel={translate('rules.maxStatus')}
            type="number"
            value={String(current.max)}
            onValueChange={(value) => onChange({ ...current, max: toInt(value, current.max) })}
          />
        </>
      );
    }
    case 'mime': {
      const current = matcher;
      return (
        <>
          <Select
            className={styles.phase}
            ariaLabel={translate('rules.phase')}
            value={current.phase}
            options={localizeOptions(PHASE_OPTIONS, 'rules.phase', translate)}
            onValueChange={(phase) => onChange({ ...current, phase: phase as RulePhase })}
          />
          <InputBox
            className={styles.value}
            ariaLabel="MIME"
            value={current.value}
            placeholder="application/json"
            onValueChange={(value) => onChange({ ...current, value })}
          />
        </>
      );
    }
    default:
      return <span className={styles.value} />;
  }
}
