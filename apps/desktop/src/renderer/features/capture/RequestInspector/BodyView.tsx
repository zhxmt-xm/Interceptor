import { FileAudio2, FileVideo2, Image as ImageIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type {
  CaptureBodyRef,
  TransferJobSnapshot,
} from '../../../../shared/desktop-api';
import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
import {
  BodyViewer,
  UnavailableBody,
  formatMediaType,
  isImageMime,
  isMediaMime,
  sizeLabel,
} from '../../../components';
import { readCompleteBody } from '../data/readCompleteBody';
import { bodyPreviewRequest } from '../utils';
import styles from './BodyView.module.css';

interface BodyViewProps {
  body: CaptureBodyRef;
  /** 全屏弹窗标题；内联消息体不给，也就没有全屏入口。 */
  fullscreenTitle?: string;
  compact?: boolean;
  offset?: number;
  suggestedFileName?: string;
}

interface LoadedBody {
  bytes: Uint8Array;
  decodeStatus?: string;
}

/**
 * Capture 侧的正文外壳：按需拉字节、跟踪解码与截断状态、驱动 Save body，
 * 再把字节交给共享的 BodyViewer。它不认识档位，也不渲染正文本身。
 */
export function BodyView({
  body,
  fullscreenTitle,
  compact = false,
  offset = 0,
  suggestedFileName = 'response-body.bin',
}: BodyViewProps): React.JSX.Element {
  const { i18n, t } = useTranslation();
  const [loaded, setLoaded] = useState<LoadedBody | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveJob, setSaveJob] = useState<TransferJobSnapshot | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const preview = bodyPreviewRequest(body);
  const media = isMediaMime(body.mediaType);
  const oversizeImage = isImageMime(body.mediaType) && preview.oversizeImage;
  const skipRead = media || oversizeImage;

  useEffect(() => {
    setSaveJob(null);
    setSaveError(null);
  }, [body.bodyHash]);

  useEffect(() => {
    setLoaded(null);
    setError(null);
    if (skipRead || !body.bodyHash || body.encodedSize === 0 || !window.interceptor?.readBody) {
      return;
    }
    let active = true;
    void readCompleteBody(
      body.bodyHash,
      offset,
      preview.length,
      preview.decode ? { decode: true, encoding: body.contentEncoding } : undefined,
    )
      .then((chunk) => {
        if (active) {
          setLoaded({ bytes: chunk.bytes, decodeStatus: chunk.decodeStatus });
        }
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : String(loadError));
        }
      });
    return () => {
      active = false;
    };
  }, [
    body.bodyHash,
    body.encodedSize,
    body.contentEncoding,
    skipRead,
    offset,
    preview.decode,
    preview.length,
  ]);

  useEffect(() => {
    if (!saveJob || saveJob.state !== 'running') {
      return;
    }
    let active = true;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const poll = async (): Promise<void> => {
      try {
        const next = await window.interceptor.getTransferJob(saveJob.id);
        if (!active) {
          return;
        }
        setSaveJob(next);
        if (next?.state === 'running') {
          timeout = setTimeout(() => void poll(), 350);
        } else if (next?.state === 'failed') {
          setSaveError(next.message ?? t('capture.failedSaveBody', { error: 'unknown' }));
        }
      } catch (jobError) {
        if (active) {
          setSaveError(t('capture.failedSaveBody', {
            error: jobError instanceof Error ? jobError.message : String(jobError),
          }));
          setSaveJob(null);
        }
      }
    };
    timeout = setTimeout(() => void poll(), 350);
    return () => {
      active = false;
      if (timeout) {
        clearTimeout(timeout);
      }
    };
  }, [saveJob?.id, saveJob?.state, t]);

  const saveBody = (): void => {
    setSaveError(null);
    void window.interceptor.startBodyExport(
      { bodyId: body.bodyHash!, suggestedName: suggestedFileName },
      t('body.save'),
    ).then(setSaveJob).catch((saveFailure: unknown) => {
      setSaveError(t('capture.failedSaveBody', {
        error: saveFailure instanceof Error ? saveFailure.message : String(saveFailure),
      }));
    });
  };

  const bodyNotes = (): string[] => {
    const notes: string[] = [];
    if (loaded?.decodeStatus === 'limited') {
      notes.push(t('capture.decodedBodyPreviewLimited', {
        preview: sizeLabel(loaded.bytes.byteLength, i18n.language),
      }));
    } else if (!preview.decode && preview.limited) {
      notes.push(t('capture.bodyPreviewLimited', {
        preview: sizeLabel(preview.length, i18n.language),
        total: sizeLabel(body.encodedSize, i18n.language),
      }));
    }
    if (loaded?.decodeStatus === 'failed' || (preview.decode && loaded?.decodeStatus === 'skipped')) {
      notes.push(t('capture.failedDecodeBody', { encoding: body.contentEncoding }));
    }
    return notes;
  };

  if (!body.bodyHash || body.encodedSize === 0) {
    return <div className={styles.empty}>{t('capture.noBody')}</div>;
  }

  if (skipRead) {
    const audio = body.mediaType?.toLowerCase().startsWith('audio/');
    return (
      <div className={styles.unavailable} data-parity="capture-body-view">
        <UnavailableBody
          icon={oversizeImage ? ImageIcon : audio ? FileAudio2 : FileVideo2}
          mediaType={formatMediaType(body.mediaType)}
          measures={sizeLabel(body.encodedSize, i18n.language)}
          reason={oversizeImage ? t('body.imageTooLarge') : t('body.mediaNotRead')}
          saving={saveJob?.state === 'running'}
          onSave={saveBody}
          parityId="capture-media-body"
        />
        {saveError ? <span className={styles.saveError}>{saveError}</span> : null}
      </div>
    );
  }

  if (error) {
    return <div className={styles.empty}>{t('capture.failedLoadBody', { error })}</div>;
  }
  if (!loaded) {
    return <div className={styles.empty}>{t('capture.loadingBody')}</div>;
  }

  return (
    <BodyViewer
      bytes={loaded.bytes}
      mediaType={body.mediaType}
      size={body.encodedSize}
      fullscreenTitle={fullscreenTitle}
      notes={bodyNotes()}
      onSave={saveBody}
      saving={saveJob?.state === 'running'}
      compact={compact}
      automationId={AUTOMATION_IDS.capture.inspector.bodyView}
      paneAutomationId={AUTOMATION_IDS.capture.inspector.bodyPane}
      actionAutomationIds={AUTOMATION_IDS.capture.inspector.bodyAction}
      parityId="capture-body-view"
      paneParityId="capture-body-preview"
      modeAutomationIds={AUTOMATION_IDS.capture.inspector.bodyMode}
    />
  );
}
