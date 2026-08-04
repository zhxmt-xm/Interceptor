import { useTranslation } from 'react-i18next';

import { cx } from '../../../components';
import { FAILED_FACET_VALUE, PENDING_FACET_VALUE } from '../constants';
import { statusKind } from '../utils';

import styles from './StatusFacetValue.module.css';

export interface StatusFacetValueProps {
  value: string;
}

/** 状态码条目：数字码带语义色点，失败与未完成用哨兵文案。 */
export function StatusFacetValue({ value }: StatusFacetValueProps): React.JSX.Element {
  const { t } = useTranslation();
  if (value === FAILED_FACET_VALUE || value === PENDING_FACET_VALUE) {
    const failed = value === FAILED_FACET_VALUE;
    return (
      <span className={cx(styles.itemStatus, failed ? styles.statusErr : styles.statusInfo)}>
        <span className={styles.itemStatusDot} />
        {failed ? t('capture.statusFailed') : t('capture.statusPending')}
      </span>
    );
  }
  const code = Number.parseInt(value, 10);
  return (
    <span className={cx(styles.itemStatus, styles[statusKind(code)])}>
      <span className={styles.itemStatusDot} />
      {value}
    </span>
  );
}
