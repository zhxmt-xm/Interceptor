import { Copy, Download, FileAudio2, FileVideo2, Info } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type {
  CaptureBodyRef,
  TransferJobSnapshot,
} from '../../../../shared/desktop-api';
import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
import { Button, CodeViewer, IconButton, Segmented, useClipboardCopy } from '../../../components';
import { readCompleteBody } from '../data/readCompleteBody';
import { sizeLabel } from '../utils';
import {
  type BodyViewMode,
  bodyPreviewRequest,
  bodyTextForMode,
  isMediaMime,
  toHexDump,
} from './bodyContent';
import styles from './BodyView.module.css';

interface BodyViewProps {
  body: CaptureBodyRef;
  compact?: boolean;
  offset?: number;
  suggestedFileName?: string;
}

interface LoadedBody {
  bytes: Uint8Array;
  end: boolean;
  decodeStatus?: string;
}

/** 按需加载有限正文预览：文本走 Monaco（按 MIME 选语言），二进制走 hex dump。 */
export function BodyView({
  body,
  compact = false,
  offset = 0,
  suggestedFileName = 'response-body.bin',
}: BodyViewProps): React.JSX.Element {
  const { i18n, t } = useTranslation();
  const copy = useClipboardCopy();
  const [loaded, setLoaded] = useState<LoadedBody | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<BodyViewMode>('auto');
  const [saveJob, setSaveJob] = useState<TransferJobSnapshot | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hexBytesPerLine, setHexBytesPerLine] = useState(16);
  const media = isMediaMime(body.mediaType);

  useEffect(() => {
    setSaveJob(null);
    setSaveError(null);
  }, [body.bodyHash]);

  useEffect(() => {
    setLoaded(null);
    setError(null);
    const api = window.interceptor;
    if (media || !body.bodyHash || body.encodedSize === 0 || !api?.readBody) {
      return;
    }
    let active = true;
    const preview = bodyPreviewRequest(body);
    void readCompleteBody(
        body.bodyHash,
        offset,
      preview.length,
      preview.decode
          ? { decode: true, encoding: body.contentEncoding }
          : undefined,
      )
      .then((chunk) => {
        if (active) {
          setLoaded({
            bytes: chunk.bytes,
            end: chunk.end,
            decodeStatus: chunk.decodeStatus,
          });
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
    media,
    offset,
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

  const preview = bodyPreviewRequest(body);
  const decodeFailed = loaded?.decodeStatus === 'failed'
    || (preview.decode && loaded?.decodeStatus === 'skipped');
  const text = useMemo(() => {
    if (!loaded) {
      return null;
    }
    if (decodeFailed && mode === 'auto') {
      return null;
    }
    return bodyTextForMode(loaded.bytes, body.mediaType, mode);
  }, [loaded, body.mediaType, decodeFailed, mode]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element || text !== null) {
      return;
    }
    const update = (): void => {
      const available = Math.max(120, element.clientWidth - 24);
      setHexBytesPerLine(Math.max(4, Math.floor((available - 96) / 31)));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [text]);

  if (!body.bodyHash || body.encodedSize === 0) {
    return <div className={styles.empty}>{t('capture.noBody')}</div>;
  }
  if (media) {
    const MediaIcon = body.mediaType?.toLowerCase().startsWith('audio/')
      ? FileAudio2
      : FileVideo2;
    const saveBody = (): void => {
      setSaveError(null);
      void window.interceptor.startBodyExport(
        { bodyId: body.bodyHash!, suggestedName: suggestedFileName },
        t('capture.saveBody'),
      ).then(setSaveJob).catch((saveFailure: unknown) => {
        setSaveError(t('capture.failedSaveBody', {
          error: saveFailure instanceof Error ? saveFailure.message : String(saveFailure),
        }));
      });
    };
    return (
      <div className={styles.media} data-parity="capture-media-body">
        <span className={styles.mediaIcon}><MediaIcon aria-hidden="true" /></span>
        <div className={styles.mediaCopy}>
          <strong>{body.mediaType?.split(';', 1)[0] ?? 'media'}</strong>
          <span>
            {sizeLabel(body.encodedSize, i18n.language)} · {t('capture.mediaPreviewUnavailable')}
          </span>
          {saveError ? <span className={styles.saveError}>{saveError}</span> : null}
        </div>
        <Button
          icon={Download}
          size="sm"
          loading={saveJob?.state === 'running'}
          onClick={saveBody}
        >
          {t('capture.saveBody')}
        </Button>
      </div>
    );
  }
  if (error) {
    return <div className={styles.empty}>{t('capture.failedLoadBody', { error })}</div>;
  }
  if (!loaded) {
    return <div className={styles.empty}>{t('capture.loadingBody')}</div>;
  }

  const decodedLimited = loaded?.decodeStatus === 'limited';
  const bodyViewModes = [
    { label: t('capture.auto'), value: 'auto' },
    { label: t('capture.text'), value: 'text' },
    { label: 'JSON', value: 'json' },
    { label: 'Hex', value: 'hex' },
  ];
  const copyBody = (): void => {
    const content = text !== null
      ? text.text
      : toHexDump(loaded.bytes, hexBytesPerLine);
    copy(content);
  };
  const modeControl = (
    <div className={styles.modeBar}>
      <Segmented
        options={bodyViewModes}
        value={mode}
        onChange={(value) => setMode(value as BodyViewMode)}
        automationIds={AUTOMATION_IDS.capture.inspector.bodyMode}
      />
      {compact ? null : (
        <IconButton
          className={styles.bodyCopy}
          icon={Copy}
          label={t('capture.copy')}
          size="sm"
          onClick={copyBody}
        />
      )}
    </div>
  );
  const previewNotice = decodedLimited ? (
    <div className={styles.limitNotice}>
      <Info aria-hidden="true" />
      {t('capture.decodedBodyPreviewLimited', {
        preview: sizeLabel(loaded.bytes.byteLength, i18n.language),
      })}
    </div>
  ) : !preview.decode && preview.limited ? (
    <div className={styles.limitNotice}>
      <Info aria-hidden="true" />
      {t('capture.bodyPreviewLimited', {
        preview: sizeLabel(preview.length, i18n.language),
        total: sizeLabel(body.encodedSize, i18n.language),
      })}
    </div>
  ) : null;

  if (text !== null) {
    return (
      <div ref={containerRef} className={`${styles.container}${compact ? ` ${styles.compact}` : ''}`} data-parity="capture-body-view">
        {modeControl}
        {previewNotice}
        {decodeFailed ? (
          <div className={styles.notice}>
            {t('capture.failedDecodeBody', { encoding: body.contentEncoding })}
          </div>
        ) : null}
        <CodeViewer
          value={text.text}
          language={text.language}
          compact={compact}
          parityId="capture-body-preview"
        />
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`${styles.container}${compact ? ` ${styles.compact}` : ''}`} data-parity="capture-body-view">
      {modeControl}
      {previewNotice}
      {decodeFailed ? (
        <div className={styles.notice}>
          {t('capture.failedDecodeBody', { encoding: body.contentEncoding })}
        </div>
      ) : null}
      <pre className={styles.hex} data-parity="capture-body-preview">
        {toHexDump(loaded.bytes, hexBytesPerLine)}
      </pre>
    </div>
  );
}
