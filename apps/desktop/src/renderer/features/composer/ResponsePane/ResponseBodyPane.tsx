import { Copy } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
import type { ComposerResponse } from '../../../../shared/desktop-api';
import { CodeViewer } from '../../../components/CodeViewer/CodeViewer';
import { IconButton } from '../../../components/IconButton/IconButton';
import { Segmented } from '../../../components/Segmented/Segmented';
import { useClipboardCopy } from '../../../components/share/useClipboardCopy';
import { useComposerStore } from '../data/composerStore';
import type { ResponseBodyMode } from '../interfaces';
import { readHeader, renderResponseBody, responseLanguage } from '../utils';

import styles from './ResponseBodyPane.module.css';

export interface ResponseBodyPaneProps {
  requestId: string;
  response: ComposerResponse;
  mode: ResponseBodyMode;
}

/** 响应正文：Auto/Text/JSON/Hex 四种呈现共用同一只读查看器。 */
export function ResponseBodyPane({
  requestId,
  response,
  mode,
}: ResponseBodyPaneProps): React.JSX.Element {
  const { t } = useTranslation();
  const copy = useClipboardCopy();
  const setResponseBodyMode = useComposerStore(
    (state) => state.setResponseBodyMode,
  );
  const text = renderResponseBody(response, mode);

  return (
    <div className={styles.pane}>
      <div className={styles.bar}>
        <Segmented
          options={[
            { label: t('composer.auto'), value: 'auto' },
            { label: t('composer.text'), value: 'text' },
            { label: 'JSON', value: 'json' },
            { label: t('composer.hex'), value: 'hex' },
          ]}
          value={mode}
          onChange={(next) =>
            setResponseBodyMode(requestId, next as ResponseBodyMode)
          }
          ariaLabel={t('composer.responseBodyMode')}
          automationIds={{ auto: AUTOMATION_IDS.composer.responseBodyMode }}
        />
        <span className={styles.spacer} />
        <span className={styles.meta}>
          {readHeader(response, 'content-type') ?? t('composer.unknownType')}
        </span>
        <IconButton
          icon={Copy}
          label={t('composer.copyResponseBody')}
          size="sm"
          onClick={() => copy(text)}
        />
      </div>
      <div className={styles.viewer}>
        <CodeViewer
          value={text}
          language={mode === 'hex' ? 'plaintext' : responseLanguage(response, mode)}
        />
      </div>
    </div>
  );
}
