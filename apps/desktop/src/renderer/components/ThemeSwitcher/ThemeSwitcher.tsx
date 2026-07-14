import { Check, Moon, Sun, Sunrise, Sunset, type LucideIcon } from 'lucide-react';
import { useRef, useState } from 'react';

import type { ThemeMode } from '../../theme/theme';
import { cx } from '../cx';
import { Flyout } from '../Flyout/Flyout';
import { ThemeScene } from './scenes';
import styles from './ThemeSwitcher.module.css';

// Ordered as one day: dawn (warm) → noon (light) → dusk (ember) → night (dark).
const THEMES: Array<{ id: ThemeMode; label: string; Icon: LucideIcon }> = [
  { id: 'warm', label: 'Warm', Icon: Sunrise },
  { id: 'light', label: 'Light', Icon: Sun },
  { id: 'ember', label: 'Ember', Icon: Sunset },
  { id: 'dark', label: 'Dark', Icon: Moon },
];

export interface ThemeSwitcherProps {
  theme: ThemeMode;
  collapsed?: boolean;
  onChange: (theme: ThemeMode) => void;
}

/** Sidebar footer control: current time-of-day icon opens a flyout of the four
 *  themes, each previewing its landscape on hover. */
export function ThemeSwitcher({
  theme,
  collapsed,
  onChange,
}: ThemeSwitcherProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const current = THEMES.find((entry) => entry.id === theme);
  const CurrentIcon = current?.Icon ?? Sun;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={cx(styles.trigger, collapsed && styles.collapsed, open && styles.open)}
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <CurrentIcon size={18} strokeWidth={1.9} />
        <span className={styles.text}>Theme</span>
        <span className={styles.dot} />
      </button>
      <Flyout open={open} anchorRef={triggerRef} onClose={() => setOpen(false)}>
        <div className={styles.title}>Theme</div>
        {THEMES.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            className={styles.item}
            onClick={() => {
              onChange(id);
              setOpen(false);
            }}
          >
            <Icon size={16} strokeWidth={1.9} />
            <span className={styles.name}>{label}</span>
            {theme === id ? <Check size={15} strokeWidth={2.4} className={styles.check} /> : null}
            <span className={styles.art}>
              <ThemeScene theme={id} />
            </span>
          </button>
        ))}
      </Flyout>
    </>
  );
}
