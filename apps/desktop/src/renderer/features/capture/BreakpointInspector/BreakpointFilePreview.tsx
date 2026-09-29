import { CodeXml, ImageOff, Info, TriangleAlert } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { FORMAT_AUTO_MAX_BYTES, FORMAT_MAX_BYTES, IMAGE_PREVIEW_MAX_BYTES, type BreakpointBodyFile } from '../../../../shared/desktop-api';
import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
import { CodeViewer, IconButton, isImageMime, sizeLabel } from '../../../components';
import type { CodeViewerHandle } from '../../../components/CodeViewer/CodeViewer';
import { bodyFormat } from '../../../components/BodyViewer/bodyFormats';
import { decodeUtf8, formatJsonBody, previewSizeLabel } from '../../../components/BodyViewer/bodyText';
import { ImageView } from '../../../components/BodyViewer/ImageView/ImageView';
import styles from './BreakpointFilePreview.module.css';

export function BreakpointFilePreview({ file }: { file: BreakpointBodyFile }): React.JSX.Element {
  const { i18n, t } = useTranslation();
  const preview = file.preview;
  const image = isImageMime(file.mediaType);
  const source = useMemo(() => preview && !image ? decodeUtf8(preview.bytes, preview.truncated) : '', [preview, image]);
  const format = useMemo(() => bodyFormat(file.mediaType, preview?.bytes, preview?.truncated), [file.mediaType, preview]);
  const automatic = preview !== undefined && !preview.truncated && preview.bytes.byteLength <= FORMAT_AUTO_MAX_BYTES;
  const blocked = !preview || preview.truncated || preview.bytes.byteLength > FORMAT_MAX_BYTES;
  const canFormat = format.kind === 'json' || format.kind === 'code';
  const [formatted, setFormatted] = useState<{ preview: BreakpointBodyFile['preview']; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const viewer = useRef<CodeViewerHandle>(null);
  const text = formatted && formatted.preview === preview ? formatted.text
    : automatic && format.kind === 'json' ? formatJsonBody(source) ?? source : source;
  useEffect(() => {
    setFailed(false);
    setImageFailed(false);
  }, [preview]);

  const formatPreview = async (): Promise<void> => {
    if (blocked || !canFormat) return;
    setBusy(true);
    setFailed(false);
    try {
      const next = format.kind === 'json' ? formatJsonBody(source) : await viewer.current?.format(format.language);
      if (next === null || next === undefined) setFailed(true);
      else setFormatted({ preview, text: next });
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (automatic && format.kind === 'code') void formatPreview();
  }, [preview, automatic, format.kind]);

  const limitedImage = image && (!preview || preview.truncated || file.size > IMAGE_PREVIEW_MAX_BYTES);
  const notice = failed ? t('body.formatFailed')
    : preview?.truncated ? `${t('body.previewLimited', {
      preview: previewSizeLabel(preview.bytes.byteLength), total: previewSizeLabel(file.size),
    })} ${t('body.formatTruncated')}`
      : !automatic && canFormat && preview ? t('body.formatManual', { size: previewSizeLabel(preview.bytes.byteLength) }) : '';

  if (limitedImage) {
    return <div className={styles.imageLimit}>
      <ImageOff aria-hidden="true" />
      <b>{file.mediaType} · {previewSizeLabel(file.size)}</b>
      <p>{t('body.imagePreviewLimit')}</p>
      <small>{t('breakpoints.fileForwardComplete')}</small>
    </div>;
  }

  return (
    <div className={styles.preview}>
      <p className={styles.fileNote}>{t('breakpoints.filePreviewOnly')}</p>
      {imageFailed ? (
        <div className={styles.imageLimit}>
          <ImageOff aria-hidden="true" />
          <b>{file.mediaType} · {sizeLabel(file.size, i18n.language)}</b>
          <p>{t('body.imageUndecodable')}</p>
        </div>
      ) : image && preview ? (
        <ImageView bytes={preview.bytes} mediaType={file.mediaType} onLoad={() => undefined} onError={() => setImageFailed(true)} />
      ) : preview ? (
        <>
          {notice ? <div className={styles.notice} data-warning={preview.truncated || undefined}>
            {preview.truncated ? <TriangleAlert aria-hidden="true" /> : <Info aria-hidden="true" />}
            <span>{notice}</span>
            {canFormat ? <IconButton icon={CodeXml} label={t('body.format')} size="sm" loading={busy} disabled={blocked}
              disabledTooltip={t(preview.truncated ? 'body.formatTruncated' : 'body.formatBlocked')}
              onClick={() => void formatPreview()} automationId={AUTOMATION_IDS.breakpoints.fileFormat} /> : null}
          </div> : null}
          <CodeViewer ref={viewer} value={text} language="plaintext" compact resizable borderless
            automationId={AUTOMATION_IDS.breakpoints.filePreview} />
        </>
      ) : <div className={styles.unavailable}>{t('breakpoints.filePreviewUnavailable')}</div>}
    </div>
  );
}
