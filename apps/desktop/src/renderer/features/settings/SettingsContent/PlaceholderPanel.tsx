import { useTranslation } from 'react-i18next';

import styles from './PlaceholderPanel.module.css';


/** Placeholder for settings sections without a designed panel yet. */
export function PlaceholderPanel({ label }: { label: string }): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <>
      <h2 className={styles.title}>{label}</h2>
      <div className={styles.desc}>{t('settings.sectionUnavailable')}</div>
    </>
  );
}
