import { Check, Globe } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { LANGUAGES, type LanguageId } from '../../i18n/languages';
import { cx } from '../share/cx';
import { Flyout } from '../Flyout/Flyout';
import styles from './LanguageSwitcher.module.css';

export type LangId = LanguageId;

export interface LanguageSwitcherProps {
  lang: LangId;
  collapsed?: boolean;
  onChange: (lang: LangId) => void;
}

/** Sidebar footer control: globe + language name (or just the code when collapsed),
 *  opening a flyout of available languages. */
export function LanguageSwitcher({
  lang,
  collapsed,
  onChange,
}: LanguageSwitcherProps): React.JSX.Element {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const current = LANGUAGES.find((entry) => entry.id === lang);

  return (
    <Flyout
      open={open}
      onOpenChange={setOpen}
      placement="rightBottom"
      className={styles.flyout}
      content={
        <>
          <div className={styles.title}>{t('common.language')}</div>
          {LANGUAGES.map(({ id, name }) => (
            <button
              key={id}
              type="button"
              className={styles.item}
              onClick={() => {
                onChange(id);
                setOpen(false);
              }}
            >
              <span className={styles.name}>{name}</span>
              {lang === id ? <Check size={15} strokeWidth={2.4} className={styles.check} /> : null}
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
        aria-label={t('common.language')}
      >
        <Globe size={18} strokeWidth={1.9} />
        <span className={styles.text}>{t('common.language')}</span>
        <span className={styles.code}>{current?.code ?? 'EN'}</span>
      </button>
    </Flyout>
  );
}

