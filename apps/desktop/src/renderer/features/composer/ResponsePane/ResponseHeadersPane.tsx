import { useTranslation } from 'react-i18next';

import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
import type { ComposerResponse } from '../../../../shared/desktop-api';
import type { CollectionRequest } from '../interfaces';

import styles from './ResponseHeadersPane.module.css';
import { ResponseSection } from './ResponseSection';

export interface ResponseHeadersPaneProps {
  request: CollectionRequest;
  response: ComposerResponse;
}

/** 响应与请求头部分区展示；请求头取自当前编辑态里启用的那些行。 */
export function ResponseHeadersPane({
  request,
  response,
}: ResponseHeadersPaneProps): React.JSX.Element {
  const { t } = useTranslation();
  const sentHeaders = request.headers.filter((row) => row.enabled);

  return (
    <div className={styles.scroll}>
      <ResponseSection
        title={t('composer.responseHeaders')}
        automationId={AUTOMATION_IDS.composer.responseSection.responseHeaders}
        count={response.headers.length}
        rows={response.headers}
      />
      <ResponseSection
        title={t('composer.requestHeaders')}
        automationId={AUTOMATION_IDS.composer.responseSection.requestHeaders}
        count={sentHeaders.length}
        rows={sentHeaders}
      />
    </div>
  );
}
