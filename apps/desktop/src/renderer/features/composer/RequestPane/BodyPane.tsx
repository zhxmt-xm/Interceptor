import { Braces, Copy, Maximize2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
import { BodyFullscreen } from '../../../components/BodyFullscreen/BodyFullscreen';
import { CodeEditor } from '../../../components/CodeEditor/CodeEditor';
import { IconButton } from '../../../components/IconButton/IconButton';
import { Segmented } from '../../../components/Segmented/Segmented';
import { useClipboardCopy } from '../../../components/share/useClipboardCopy';
import { useComposerStore } from '../data/composerStore';
import type { CollectionRequest, ComposerBodyType } from '../interfaces';
import { KeyValueTable } from '../KeyValueTable/KeyValueTable';
import { bodyContentType, buildRequestBody, formatJson } from '../utils';

import styles from './BodyPane.module.css';

export interface BodyPaneProps {
  request: CollectionRequest;
}

/** 请求正文的四档形态；只有 JSON/Text 用编辑器，Form 是键值表，None 是占位文案。 */
export function BodyPane({ request }: BodyPaneProps): React.JSX.Element {
  const { t } = useTranslation();
  const copy = useClipboardCopy();
  const [fullscreen, setFullscreen] = useState(false);
  const updateRequest = useComposerStore((state) => state.updateRequest);
  const body = buildRequestBody(request) ?? '';
  const isEditor = request.bodyType === 'json' || request.bodyType === 'text';
  const meta = t('composer.bodyMeta', {
    size: new TextEncoder().encode(body).byteLength,
    type: bodyContentType(request.bodyType),
  });

  const content = (
    <>
      <div className={styles.bar}>
        <Segmented
          options={[
            { label: t('composer.none'), value: 'none' },
            { label: 'JSON', value: 'json' },
            { label: t('composer.text'), value: 'text' },
            { label: t('composer.form'), value: 'form' },
          ]}
          value={request.bodyType}
          onChange={(bodyType) =>
            updateRequest({ ...request, bodyType: bodyType as ComposerBodyType })
          }
          ariaLabel={t('composer.bodyType')}
          automationIds={{ json: AUTOMATION_IDS.composer.bodyType, form: AUTOMATION_IDS.composer.bodyFormType }}
        />
        <span className={styles.spacer} />
        {request.bodyType === 'none' ? null : (
          <>
            <span className={styles.meta}>{meta}</span>
            <div className={styles.tools}>
              {request.bodyType === 'json' ? (
                <IconButton
                  icon={Braces}
                  label={t('composer.formatJson')}
                  size="sm"
                  onClick={() =>
                    updateRequest({
                      ...request,
                      bodyText: formatJson(request.bodyText),
                    })
                  }
                />
              ) : null}
              <IconButton
                icon={Copy}
                label={t('composer.copyBody')}
                size="sm"
                onClick={() => copy(body)}
              />
              {fullscreen ? null : (
                <IconButton
                  icon={Maximize2}
                  label={t('body.fullscreen')}
                  size="sm"
                  onClick={() => setFullscreen(true)}
                />
              )}
            </div>
          </>
        )}
      </div>

      {isEditor ? (
        <div className={styles.editor} data-automation-id={AUTOMATION_IDS.composer.body}>
          <CodeEditor
            value={request.bodyText}
            language={request.bodyType === 'json' ? 'json' : 'plaintext'}
            onValueChange={(bodyText) => updateRequest({ ...request, bodyText })}
            parityId="composer-body-editor"
          />
        </div>
      ) : null}

      {request.bodyType === 'form' ? (
        <KeyValueTable
          rows={request.bodyForm}
          onChange={(bodyForm) => updateRequest({ ...request, bodyForm })}
          nameLabel={t('composer.name')}
          valueLabel={t('composer.value')}
          draftAutomationIds={{
            name: AUTOMATION_IDS.composer.formDraft.name,
            value: AUTOMATION_IDS.composer.formDraft.value,
            confirm: AUTOMATION_IDS.composer.addForm,
          }}
        />
      ) : null}

      {request.bodyType === 'none' ? (
        <div className={styles.empty}>{t('composer.noBody')}</div>
      ) : null}
    </>
  );

  return (
    <div className={styles.pane}>
      {fullscreen ? (
        <BodyFullscreen
          title={t('composer.requestBody')}
          meta={meta}
          onCopy={() => copy(body)}
          onClose={() => setFullscreen(false)}
        >
          {content}
        </BodyFullscreen>
      ) : (
        content
      )}
    </div>
  );
}
