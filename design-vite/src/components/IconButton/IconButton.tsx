import { Button, Tooltip } from 'antd';
import type { ReactNode } from 'react';

import styles from './IconButton.module.css';

type IconButtonTone = 'default' | 'accent' | 'danger' | 'warning';

interface IconButtonProps {
  readonly disabled?: boolean;
  readonly icon: ReactNode;
  readonly label: string;
  readonly onClick?: () => void;
  readonly pressed?: boolean;
  readonly tone?: IconButtonTone;
}

const COLOR_BY_TONE = {
  default: 'default',
  accent: 'primary',
  danger: 'danger',
  warning: 'default',
} as const;

export function IconButton({
  disabled,
  icon,
  label,
  onClick,
  pressed,
  tone = 'default',
}: IconButtonProps): React.JSX.Element {
  return (
    <Tooltip mouseEnterDelay={0.4} title={label}>
      <Button
        aria-label={label}
        aria-pressed={pressed}
        classNames={{ root: styles.iconButton, icon: styles.iconButtonIcon }}
        color={COLOR_BY_TONE[tone]}
        disabled={disabled}
        icon={icon}
        styles={{
          root: {
            width: 30,
            minWidth: 30,
            height: 30,
            flex: '0 0 30px',
            padding: 0,
            borderRadius: 9,
            ...(tone === 'warning'
              ? {
                  background: 'color-mix(in srgb, var(--yellow) 14%, transparent)',
                  color: 'var(--yellow)',
                }
              : {}),
          },
          icon: {
            width: 15,
            height: 15,
          },
        }}
        variant="text"
        onClick={onClick}
      />
    </Tooltip>
  );
}