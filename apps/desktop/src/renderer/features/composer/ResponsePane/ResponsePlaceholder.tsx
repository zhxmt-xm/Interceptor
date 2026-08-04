import { Send } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cx } from '../../../components/share/cx';

import styles from './ResponsePlaceholder.module.css';

export interface ResponsePlaceholderProps {
  sending: boolean;
  /** 上一次发送的失败原因；有值时替代常规说明文案。 */
  sendError: string | null;
}

/** 尚未发送、正在发送或发送失败时占据响应区的说明块。 */
export function ResponsePlaceholder({
  sending,
  sendError,
}: ResponsePlaceholderProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <div className={styles.placeholder}>
      <span className={styles.icon}>
        <Send strokeWidth={1.9} />
      </span>
      <b className={styles.title}>
        {sending ? t('composer.waitingForResponse') : t('composer.noResponseYet')}
      </b>
      <span className={cx(styles.detail, sendError && styles.error)}>
        {sendError
          ?? (sending ? t('composer.waitingDetail') : t('composer.noResponseDetail'))}
      </span>
    </div>
  );
}
