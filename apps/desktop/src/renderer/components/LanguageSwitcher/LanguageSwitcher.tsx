import { Check, Globe } from 'lucide-react';
import { useRef, useState } from 'react';

import { cx } from '../cx';
import { Flyout } from '../Flyout/Flyout';
import styles from './LanguageSwitcher.module.css';

export type LangId = 'en' | 'zh' | 'ja' | 'de';

const LANGS: Array<{ id: LangId; label: string; code: string }> = [
  { id: 'en', label: 'English', code: 'EN' },
  { id: 'zh', label: '简体中文', code: '中' },
  { id: 'ja', label: '日本語', code: 'あ' },
  { id: 'de', label: 'Deutsch', code: 'DE' },
];

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
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const current = LANGS.find((entry) => entry.id === lang);

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
        <Globe size={18} strokeWidth={1.9} />
        <span className={styles.text}>Language</span>
        <span className={styles.code}>{current?.code ?? 'EN'}</span>
      </button>
      <Flyout open={open} anchorRef={triggerRef} onClose={() => setOpen(false)}>
        <div className={styles.title}>Language</div>
        {LANGS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            className={styles.item}
            onClick={() => {
              onChange(id);
              setOpen(false);
            }}
          >
            <span className={styles.name}>{label}</span>
            {lang === id ? <Check size={15} strokeWidth={2.4} className={styles.check} /> : null}
          </button>
        ))}
      </Flyout>
    </>
  );
}
