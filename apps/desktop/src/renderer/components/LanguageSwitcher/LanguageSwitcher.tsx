import { Check, Globe } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { LANGUAGES, type LanguageId } from '../../i18n/languages';
import { AUTOMATION_IDS, type AutomationId } from '../../../shared/automation-ids';
import { cx } from '../share/cx';
import { Flyout } from '../Flyout/Flyout';
import styles from './LanguageSwitcher.module.css';

const LANGUAGE_AUTOMATION_IDS: Record<LanguageId, AutomationId> = {
  en: AUTOMATION_IDS.shell.language.en,
  'zh-CN': AUTOMATION_IDS.shell.language.zhCN,
  'zh-TW': AUTOMATION_IDS.shell.language.zhTW,
  ja: AUTOMATION_IDS.shell.language.ja,
  ko: AUTOMATION_IDS.shell.language.ko,
  de: AUTOMATION_IDS.shell.language.de,
  fr: AUTOMATION_IDS.shell.language.fr,
  es: AUTOMATION_IDS.shell.language.es,
  it: AUTOMATION_IDS.shell.language.it,
  'pt-BR': AUTOMATION_IDS.shell.language.ptBR,
  ru: AUTOMATION_IDS.shell.language.ru,
  nl: AUTOMATION_IDS.shell.language.nl,
  pl: AUTOMATION_IDS.shell.language.pl,
  tr: AUTOMATION_IDS.shell.language.tr,
  uk: AUTOMATION_IDS.shell.language.uk,
};

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
              data-automation-id={LANGUAGE_AUTOMATION_IDS[id]}
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
        data-automation-id={AUTOMATION_IDS.shell.language.trigger}
      >
        <Globe size={18} strokeWidth={1.9} />
        <span className={styles.text}>{t('common.language')}</span>
        <span className={styles.code}>{current?.code ?? 'EN'}</span>
      </button>
    </Flyout>
  );
}

