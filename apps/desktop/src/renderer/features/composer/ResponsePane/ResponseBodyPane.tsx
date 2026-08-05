import { useTranslation } from 'react-i18next';

import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
import type { ComposerResponse } from '../../../../shared/desktop-api';
import { BodyViewer } from '../../../components';
import { readHeader } from '../utils';

import styles from './ResponseBodyPane.module.css';

export interface ResponseBodyPaneProps {
  response: ComposerResponse;
}

/** 响应正文复用 Capture 的查看器内核，档位同样由 MIME 派生。 */
export function ResponseBodyPane({ response }: ResponseBodyPaneProps): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div className={styles.pane}>
      <BodyViewer
        bytes={response.body}
        mediaType={readHeader(response, 'content-type') ?? t('composer.unknownType')}
        fullscreenTitle={t('composer.responseBody')}
        modeAutomationIds={{ default: AUTOMATION_IDS.composer.responseBodyMode }}
      />
    </div>
  );
}
