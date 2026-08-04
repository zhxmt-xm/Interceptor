import { Send } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import styles from './NoOpenRequest.module.css';

/** 一个文档都没打开时占据工作区的说明块。 */
export function NoOpenRequest(): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div className={styles.empty}>
      <span className={styles.icon}>
        <Send strokeWidth={1.9} />
      </span>
      <b className={styles.title}>{t('composer.noOpenRequest')}</b>
      <span className={styles.detail}>{t('composer.noOpenRequestDetail')}</span>
    </div>
  );
}
