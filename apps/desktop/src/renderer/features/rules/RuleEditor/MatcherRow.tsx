import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { IconButton, InputBox, Select } from '../../../components';
import type {
  KeyMatchMode,
  RuleMatcher,
  RuleMatcherType,
  RulePhase,
  StringMatchMode,
} from '../../../../shared/desktop-api';
import {
  createMatcher,
  KEY_MODE_OPTIONS,
  localizeOptions,
  MATCHER_TYPE_OPTIONS,
  PHASE_OPTIONS,
  STRING_MODE_OPTIONS,
} from '../rule-format';
import styles from './MatcherRow.module.css';

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
        <>
          <Select
            className={styles.mode}
            ariaLabel={translate('rules.matchMode')}
            value={current.mode}
            options={localizeOptions(STRING_MODE_OPTIONS, 'rules.matchMode', translate)}
            onValueChange={(mode) => onChange({ ...current, mode: mode as StringMatchMode })}
          />
          <InputBox
            className={styles.value}
            ariaLabel={translate('rules.value')}
            value={current.value}
            placeholder={placeholder}
            onValueChange={(value) => onChange({ ...current, value })}
          />
        </>
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
          <Select
            className={styles.mode}
            ariaLabel={translate('rules.matchMode')}
            value={current.mode}
            options={localizeOptions(KEY_MODE_OPTIONS, 'rules.matchMode', translate)}
            onValueChange={(mode) => onChange({ ...current, mode: mode as KeyMatchMode })}
          />
          {current.mode !== 'present' ? (
            <InputBox
              className={styles.value}
              ariaLabel={translate('rules.value')}
              value={current.value ?? ''}
              onValueChange={(value) => onChange({ ...current, value })}
            />
          ) : null}
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
          <Select
            className={styles.mode}
            ariaLabel={translate('rules.matchMode')}
            value={current.mode}
            options={localizeOptions(KEY_MODE_OPTIONS, 'rules.matchMode', translate)}
            onValueChange={(mode) => onChange({ ...current, mode: mode as KeyMatchMode })}
          />
          {current.mode !== 'present' ? (
            <InputBox
              className={styles.value}
              ariaLabel={translate('rules.value')}
              value={current.value ?? ''}
              onValueChange={(value) => onChange({ ...current, value })}
            />
          ) : null}
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
