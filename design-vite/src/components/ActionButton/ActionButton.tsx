import type { ReactNode } from 'react';

import styles from './ActionButton.module.css';

type ActionButtonTone = 'default' | 'danger' | 'primary';

interface ActionButtonProps {
  readonly disabled?: boolean;
  readonly icon?: ReactNode;
  readonly label: string;
  readonly onClick: () => void;
  readonly tone?: ActionButtonTone;
}

const CLASS_BY_TONE: Readonly<Record<ActionButtonTone, string | undefined>> = {
  default: undefined,
  danger: styles.actionButtonDanger,
  primary: styles.actionButtonPrimary,
};

export function ActionButton({
  disabled,
  icon,
  label,
  onClick,
  tone = 'default',
}: ActionButtonProps): React.JSX.Element {
  return (
    <button
      className={[styles.actionButton, CLASS_BY_TONE[tone]].filter(Boolean).join(' ')}
      disabled={disabled}
      type="button"
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  );
}
