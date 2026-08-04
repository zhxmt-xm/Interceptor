import { useTranslation } from 'react-i18next';

import type { FormField } from '../bodyText';
import styles from './FormView.module.css';

interface FormViewProps {
  fields: FormField[];
  parityId?: string;
}

/** urlencoded 正文按字段表展示；值超长省略，完整内容仍可切到 Raw 档看。 */
export function FormView({ fields, parityId }: FormViewProps): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div className={styles.host} data-parity={parityId}>
      <div className={styles.head}>
        <span>{t('body.field')}</span>
        <span>{t('body.value')}</span>
      </div>
      {fields.map((field, index) => (
        <div key={`${field.name}-${index}`} className={styles.row}>
          <span className={styles.name}>{field.name}</span>
          <span className={styles.value}>{field.value}</span>
        </div>
      ))}
    </div>
  );
}
