import { Button, Tooltip } from 'antd';
import type { ReactNode } from 'react';

import styles from './IconButton.module.css';

type IconButtonTone = 'default' | 'accent' | 'danger' | 'warning';

interface IconButtonProps {
  readonly className?: string;
  readonly disabled?: boolean;
  readonly icon: ReactNode;
  readonly label: string;
  readonly onClick?: () => void;
  readonly pressed?: boolean;
  readonly size?: 'sm' | 'inline';
  readonly tone?: IconButtonTone;
}

const COLOR_BY_TONE = {
  default: 'default',
  accent: 'primary',
  danger: 'danger',
  warning: 'default',
} as const;

export function IconButton({
  className,
  disabled,
  icon,
  label,
  onClick,
  pressed,
  size = 'sm',
  tone = 'default',
}: IconButtonProps): React.JSX.Element {
  const inline = size === 'inline';
  const buttonSize = inline ? 18 : 30;
  const iconSize = inline ? 14 : 15;
  return (
    <Tooltip mouseEnterDelay={0.4} title={label}>
      <Button
        aria-label={label}
        aria-pressed={pressed}
        classNames={{ root: `${styles.iconButton} ${className ?? ''}`, icon: `${styles.iconButtonIcon} ${inline ? styles.iconButtonInlineIcon : ''}` }}
        color={COLOR_BY_TONE[tone]}
        disabled={disabled}
        icon={icon}
        styles={{
          root: {
            width: buttonSize,
            minWidth: buttonSize,
            height: buttonSize,
            flex: `0 0 ${buttonSize}px`,
            padding: 0,
            borderRadius: inline ? 5 : 9,
            ...(inline ? { color: 'var(--text-2)' } : {}),
            ...(tone === 'warning'
              ? {
                  background: 'color-mix(in srgb, var(--yellow) 14%, transparent)',
                  color: 'var(--yellow)',
                }
              : {}),
          },
          icon: {
            width: iconSize,
            height: iconSize,
          },
        }}
        variant="text"
        onClick={onClick}
      />
    </Tooltip>
  );
}