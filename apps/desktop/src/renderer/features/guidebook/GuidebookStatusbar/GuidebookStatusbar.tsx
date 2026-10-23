import { useTranslation } from 'react-i18next';

import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
import styles from './GuidebookStatusbar.module.css';

export function GuidebookStatusbar(): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div className={styles.status} data-automation-id={AUTOMATION_IDS.guidebook.status}>
      <span><i />{t('guidebook.statusOnline')}</span>
      <span>{t('guidebook.statusUpdated')}</span>
      <span>{t('guidebook.statusPosition')}</span>
    </div>
  );
}
