import { useTranslation } from 'react-i18next';

import type { ComposerResponse } from '../../../../shared/desktop-api';
import { responseCookies } from '../utils';

import styles from './ResponseCookiesPane.module.css';
import { ResponseSection } from './ResponseSection';

export interface ResponseCookiesPaneProps {
  response: ComposerResponse;
}

/** Set-Cookie 拆成名值对展示。 */
export function ResponseCookiesPane({
  response,
}: ResponseCookiesPaneProps): React.JSX.Element {
  const { t } = useTranslation();
  const cookies = responseCookies(response);

  return (
    <div className={styles.scroll}>
      <ResponseSection
        title={t('composer.responseCookies')}
        count={cookies.length}
        rows={cookies}
        emptyText={t('composer.noSetCookie')}
      />
    </div>
  );
}
