import { InputBox, Select } from '../../../components';
import type {
  RuleMatcher,
  RuleMatcherType,
  RulePhase,
} from '../../../../shared/desktop-api';
import { MATCHER_TYPE_OPTIONS, PHASE_OPTIONS } from '../constants';
import { localizeOptions, toInt } from '../utils';

import styles from './MatcherControls.module.css';
import { ModeToggles } from './ModeToggles';

export interface MatcherControlsProps {
  matcher: RuleMatcher;
  onChange: (matcher: RuleMatcher) => void;
  translate: (key: string) => string;
}

/** 按匹配类型渲染对应的受控控件；值与名自由输入，模式走枚举开关。 */
export function MatcherControls({
  matcher,
  onChange,
  translate,
}: MatcherControlsProps): React.JSX.Element {
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

