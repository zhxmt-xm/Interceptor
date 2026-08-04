import { cx } from '../../../components';
import type { MatchToggleMode } from '../interfaces';

import styles from './ModeToggles.module.css';

export interface ModeTogglesProps {
  mode: MatchToggleMode;
  caseSensitive: boolean;
  onModeChange: (mode: MatchToggleMode) => void;
  onCaseToggle: () => void;
  t: (key: string) => string;
}

/** value 输入框右侧的匹配开关：区分大小写、精确相等（默认关＝包含）、正则（精确/正则互斥）。 */
export function ModeToggles({
  mode,
  caseSensitive,
  onModeChange,
  onCaseToggle,
  t,
}: ModeTogglesProps): React.JSX.Element {
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
