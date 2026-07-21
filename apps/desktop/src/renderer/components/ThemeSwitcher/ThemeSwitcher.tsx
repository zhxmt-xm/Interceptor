import { Check, Moon, Sun, Sunrise, Sunset, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { ThemeMode } from '../../theme/theme';
import { AUTOMATION_IDS } from '../../../shared/automation-ids';
import { cx } from '../share/cx';
import { Flyout } from '../Flyout/Flyout';
import { ThemeScene } from './scenes';
import styles from './ThemeSwitcher.module.css';

// Ordered as one day: dawn (warm) 鈫?noon (light) 鈫?dusk (ember) 鈫?night (dark).
const THEMES: Array<{ id: ThemeMode; labelKey: string; Icon: LucideIcon }> = [
  { id: 'warm', labelKey: 'theme.warm', Icon: Sunrise },
  { id: 'light', labelKey: 'theme.light', Icon: Sun },
  { id: 'ember', labelKey: 'theme.ember', Icon: Sunset },
  { id: 'dark', labelKey: 'theme.dark', Icon: Moon },
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
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const current = THEMES.find((entry) => entry.id === theme);
  const CurrentIcon = current?.Icon ?? Sun;

  return (
    <Flyout
      open={open}
      onOpenChange={setOpen}
      placement="rightBottom"
      content={
        <>
          <div className={styles.title}>{t('common.theme')}</div>
          {THEMES.map(({ id, labelKey, Icon }) => (
            <button
              key={id}
              type="button"
              className={styles.item}
              data-automation-id={AUTOMATION_IDS.shell.theme[id]}
              onClick={() => {
                onChange(id);
                setOpen(false);
              }}
            >
              <Icon size={16} strokeWidth={1.9} />
              <span className={styles.name}>{t(labelKey)}</span>
              {theme === id ? <Check size={15} strokeWidth={2.4} className={styles.check} /> : null}
              <span className={styles.art}>
                <ThemeScene theme={id} />
              </span>
            </button>
          ))}
        </>
      }
    >
      <button
        type="button"
        className={cx(styles.trigger, collapsed && styles.collapsed, open && styles.open)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('common.theme')}
        data-automation-id={AUTOMATION_IDS.shell.theme.trigger}
      >
        <CurrentIcon size={18} strokeWidth={1.9} />
        <span className={styles.text}>{t('common.theme')}</span>
        <span className={styles.dot} />
      </button>
    </Flyout>
  );
}

