import { cx } from '../../../components';
import type { AutomationId } from '../../../../shared/automation-ids';

import styles from './ScopeOption.module.css';

export interface ScopeOptionProps {
  label: string;
  detail?: string;
  count: number | string;
  active: boolean;
  disabled?: boolean;
  automationId: AutomationId;
  onClick(): void;
}

/** 导出范围的单选项：标题、说明与右侧条数。 */
export function ScopeOption({
  label,
  detail,
  count,
  active,
  disabled = false,
  automationId,
  onClick,
}: ScopeOptionProps): React.JSX.Element {
  return (
    <button
      type="button"
      className={cx(styles.scope, active && styles.scopeActive)}
      disabled={disabled}
      onClick={onClick}
      data-automation-id={automationId}
    >
      <span className={styles.radio} />
      <span className={styles.scopeCopy}>
        <strong>{label}</strong>
        {detail ? <small>{detail}</small> : null}
      </span>
      <span className={styles.count}>{count}</span>
    </button>
  );
}
