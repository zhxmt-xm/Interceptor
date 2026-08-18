import { useTranslation } from 'react-i18next';

import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
import type { ComposerResponse } from '../../../../shared/desktop-api';
import { BodyViewer } from '../../../components';
import { readRuntime, useComposerStore } from '../data/composerStore';
import { readHeader } from '../utils';

import styles from './ResponseBodyPane.module.css';

export interface ResponseBodyPaneProps {
  requestId: string;
  response: ComposerResponse;
}

/** 响应正文复用 Capture 的查看器内核，档位同样由 MIME 派生。 */
export function ResponseBodyPane({ requestId, response }: ResponseBodyPaneProps): React.JSX.Element {
  const { t } = useTranslation();
  const formattedResponseBody = useComposerStore((state) =>
    readRuntime(state.runtimes, requestId).formattedResponseBody);
  const cacheFormattedResponseBody = useComposerStore(
    (state) => state.cacheFormattedResponseBody,
  );
  return (
    <div className={styles.pane}>
      <BodyViewer
        bytes={response.body}
        mediaType={readHeader(response, 'content-type') ?? t('composer.unknownType')}
        fullscreenTitle={t('composer.responseBody')}
        automationId={AUTOMATION_IDS.composer.responseBody}
        paneAutomationId={AUTOMATION_IDS.composer.responseBodyPane}
        formattedText={formattedResponseBody ?? undefined}
        onFormattedTextChange={(body) =>
          cacheFormattedResponseBody(requestId, response, body)}
        actionAutomationIds={AUTOMATION_IDS.composer.responseBodyAction}
        modeAutomationIds={{ default: AUTOMATION_IDS.composer.responseBodyMode }}
      />
    </div>
  );
}
