import { CodeXml, Image as ImageIcon, Info, TriangleAlert } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { BODY_PREVIEW_MAX_BYTES, FORMAT_AUTO_MAX_BYTES, FORMAT_MAX_BYTES, IMAGE_PREVIEW_MAX_BYTES } from '../../../shared/desktop-api';
import type { AutomationId } from '../../../shared/automation-ids';
import { BodyFullscreen } from '../BodyFullscreen/BodyFullscreen';
import { CodeViewer, type CodeViewerHandle } from '../CodeViewer/CodeViewer';
import { IconButton } from '../IconButton/IconButton';
import { cx } from '../share/cx';
import { sizeLabel } from '../share/sizeLabel';
import { useClipboardCopy } from '../share/useClipboardCopy';
import {
  type BodyActionAutomationIds,
  BodyToolbar,
  type FormatState,
} from './BodyToolbar/BodyToolbar';
import {
  type BodyKind,
  type BodyMode,
  bodyFormat,
  formatMediaType,
  isImageMime,
} from './bodyFormats';
import { decodeUtf8, formatJsonBody, parseFormBody, previewSizeLabel, toHexDump } from './bodyText';
import { FormView } from './FormView/FormView';
import { HexView } from './HexView/HexView';
import { ImageView } from './ImageView/ImageView';
import { JsonTreeView } from './JsonTreeView/JsonTreeView';
import { parseJsonTree } from './JsonTreeView/jsonTree';
import { MarkdownSplit } from './MarkdownView/MarkdownSplit';
import { MarkdownView } from './MarkdownView/MarkdownView';
import { UnavailableBody } from './UnavailableBody/UnavailableBody';
import styles from './BodyViewer.module.css';

export interface BodyViewerProps {
  bytes: Uint8Array;
  mediaType: string | undefined;
  /** Evidence-owned byte size; defaults to the provided byte buffer length. */
  size?: number;
  previewTruncated?: boolean;
  incomplete?: boolean;
  /** 全屏弹窗的标题；不给就不提供全屏入口。 */
  fullscreenTitle?: string;
  /** 关于这份正文的提示行：预览截断、解码失败等，按传入顺序显示在正文上方。 */
  notes?: string[];
  /** 音视频与图片降级的唯一出口；缺省时不显示 Save 动作。 */
  onSave?: () => void;
  saving?: boolean;
  /** 内联消息面板用的紧凑排版。 */
  compact?: boolean;
  resizable?: boolean;
  showFormatNotice?: boolean;
  automationId?: AutomationId;
  paneAutomationId?: AutomationId;
  parityId?: string;
  /** 内容面板自己的 parity 锚点，对应设计稿的 `.bpane`。 */
  paneParityId?: string;
  /** Owner按业务实体保存的格式化视图；不替换原始bytes。 */
  formattedText?: string;
  onFormattedTextChange?: (formattedText: string) => void;
  actionAutomationIds?: BodyActionAutomationIds;
  modeAutomationIds?: Record<string, string>;
}

/**
 * 正文查看器内核：只认字节与 MIME，不认 hash、IPC 与加载状态。
 * `kind` 由内容决定并锁定标签，`mode` 只切换渲染方式，两者互不影响。
 */
export function BodyViewer({
  bytes: suppliedBytes,
  mediaType,
  size = suppliedBytes.byteLength,
  previewTruncated: suppliedTruncated = false,
  incomplete = false,
  fullscreenTitle,
  notes,
  onSave,
  saving = false,
  compact = false,
  resizable = false,
  showFormatNotice = false,
  automationId,
  paneAutomationId,
  parityId,
  paneParityId,
  formattedText,
  onFormattedTextChange,
  actionAutomationIds,
  modeAutomationIds,
}: BodyViewerProps): React.JSX.Element {
  const { i18n, t } = useTranslation();
  const copy = useClipboardCopy();
  const imageMime = isImageMime(mediaType);
  const previewLimit = imageMime ? IMAGE_PREVIEW_MAX_BYTES : BODY_PREVIEW_MAX_BYTES;
  const bytes = useMemo(() => !imageMime && suppliedBytes.byteLength > previewLimit
    ? suppliedBytes.slice(0, previewLimit) : suppliedBytes, [suppliedBytes, previewLimit, imageMime]);
  const previewTruncated = suppliedTruncated || suppliedBytes.byteLength > previewLimit;
  const partialDocument = incomplete || previewTruncated;
  const viewerRef = useRef<CodeViewerHandle>(null);
  const nextFormatId = useRef(0);
  const format = useMemo(() => bodyFormat(mediaType, bytes, previewTruncated), [mediaType, bytes, previewTruncated]);
  const [selected, setSelected] = useState<{ kind: BodyKind; mode: BodyMode } | null>(null);
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const [activeFormatId, setActiveFormatId] = useState<number | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [localFormattedText, setLocalFormattedText] = useState<{ bytes: Uint8Array; text: string } | null>(null);
  const [formatFailed, setFormatFailed] = useState(false);
  const displayedFormattedText = formattedText ?? (localFormattedText?.bytes === bytes ? localFormattedText.text : undefined);
  useEffect(() => setFormatFailed(false), [bytes, selected]);

  const text = useMemo(
    () => (format.kind === 'image' || format.kind === 'media' ? '' : decodeUtf8(bytes, previewTruncated)),
    [bytes, format.kind, previewTruncated],
  );
  const pretty = useMemo(
    () => (format.kind === 'json' && !partialDocument && bytes.byteLength <= FORMAT_AUTO_MAX_BYTES
      ? formatJsonBody(text) ?? text : text),
    [format.kind, text, partialDocument, bytes.byteLength],
  );
  const fields = useMemo(
    () => (format.kind === 'form' ? parseFormBody(text) : []),
    [format.kind, text],
  );
  // A truncated or streamed JSON body has no single tree to show, so the档位 disappears
  // instead of failing after the user picks it.
  const tree = useMemo(
    () => (format.kind === 'json' && !partialDocument ? parseJsonTree(text) : undefined),
    [format.kind, text, partialDocument],
  );
  const available = useMemo(
    () => (tree === undefined
      ? { ...format, modes: format.modes.filter((option) => option !== 'tree') }
      : format),
    [format, tree],
  );
  const mode = selected?.kind === available.kind && available.modes.includes(selected.mode)
    ? selected.mode
    : available.defaultMode;

  const meta = imageSize
    ? `${formatMediaType(mediaType)} · ${imageSize.width} × ${imageSize.height}`
    : `${formatMediaType(mediaType)} · ${sizeLabel(size, i18n.language)}`;

  const formattable = (available.kind === 'code' || available.kind === 'json') && mode === 'default';
  const oversizeToFormat = bytes.byteLength > FORMAT_MAX_BYTES;
  const formatBlocked = oversizeToFormat || partialDocument;
  const formatting = activeFormatId !== null;
  const autoJson = available.kind === 'json' && !formatBlocked && bytes.byteLength <= FORMAT_AUTO_MAX_BYTES;
  const formatState: FormatState = !formattable || autoJson
    ? 'hidden'
    : formatBlocked ? 'blocked' : formatting ? 'busy' : 'idle';

  const runFormat = async (): Promise<void> => {
    if (!formattable || formatBlocked) return;
    const formatId = ++nextFormatId.current;
    setActiveFormatId(formatId);
    setFormatFailed(false);
    try {
      const formatted = available.kind === 'json' ? formatJsonBody(text) ?? undefined : await viewerRef.current?.format();
      if (formatted !== undefined) {
        if (onFormattedTextChange) onFormattedTextChange(formatted);
        else setLocalFormattedText({ bytes, text: formatted });
      } else setFormatFailed(true);
    } catch {
      setFormatFailed(true);
    } finally {
      setActiveFormatId((current) => current === formatId ? null : current);
    }
  };

  useEffect(() => {
    if (
      formattable
      && available.kind === 'code'
      && !formatBlocked
      && displayedFormattedText === undefined
      && bytes.byteLength <= FORMAT_AUTO_MAX_BYTES
    ) {
      void runFormat();
    }
    // Re-formats when the body or the selected view changes, not on every render.
  }, [bytes, formattable, displayedFormattedText, formatBlocked]);

  const previewNotes = [
    ...(notes ?? []),
    ...(suppliedBytes.byteLength > previewLimit ? [t('capture.bodyPreviewLimited', {
      preview: previewSizeLabel(previewLimit), total: previewSizeLabel(size),
    })] : []),
  ];
  const formatNotice = showFormatNotice && formattable
    && (formatBlocked || bytes.byteLength > FORMAT_AUTO_MAX_BYTES || formatFailed);
  const formatNoticeText = formatFailed ? t('body.formatFailed')
    : partialDocument ? `${t('body.previewLimited', {
      preview: previewSizeLabel(bytes.byteLength), total: previewSizeLabel(size),
    })} ${t('body.formatTruncated')}`
      : t('body.formatManual', { size: previewSizeLabel(bytes.byteLength) });
  const bodyNotes = formatNotice ? [] : [
    ...previewNotes,
    ...(formattable && partialDocument ? [t('body.formatTruncated')] : []),
    ...(oversizeToFormat && formattable ? [t('body.formatBlocked')] : []),
    ...(formatFailed ? [t('body.formatFailed')] : []),
  ];

  const copyBody = (): void => {
    const visibleText = formattable
      ? displayedFormattedText ?? viewerRef.current?.value() ?? pretty
      : mode === 'hex' ? toHexDump(bytes) : mode === 'default' ? pretty : text;
    copy(visibleText);
  };
  const copyAction = format.kind === 'image' ? undefined : copyBody;

  const content = (
    <>
      <BodyToolbar
        format={available}
        mode={mode}
        onModeChange={(next) => setSelected({ kind: available.kind, mode: next })}
        meta={meta}
        formatState={formatNotice ? 'hidden' : formatState}
        formatBlockedReason={partialDocument ? t('body.formatTruncated') : undefined}
        onFormat={() => void runFormat()}
        onCopy={fullscreen ? undefined : copyAction}
        onSave={onSave}
        onFullscreen={
          fullscreenTitle && !fullscreen ? () => setFullscreen(true) : undefined
        }
        actionAutomationIds={actionAutomationIds}
        modeAutomationIds={modeAutomationIds}
      />
      {formatNotice ? (
        <div className={cx(styles.note, styles.formatNotice)} data-warning={partialDocument || undefined}>
          {partialDocument ? <TriangleAlert aria-hidden="true" /> : <Info aria-hidden="true" />}
          <span>{formatNoticeText}</span>
          <IconButton
            icon={CodeXml}
            label={t('body.format')}
            size="sm"
            loading={formatting}
            disabled={formatBlocked}
            disabledTooltip={partialDocument ? t('body.formatTruncated') : t('body.formatBlocked')}
            onClick={() => void runFormat()}
            automationId={actionAutomationIds?.format}
          />
        </div>
      ) : null}
      {bodyNotes?.map((note) => (
        <div key={note} className={styles.note}>
          <Info aria-hidden="true" />
          {note}
        </div>
      ))}
      {renderPane()}
    </>
  );

  return (
    <div
      className={cx(styles.host, compact && styles.compact)}
      data-automation-id={automationId}
      data-parity={parityId}
    >
      {fullscreen && fullscreenTitle ? (
        <BodyFullscreen
          title={fullscreenTitle}
          meta={meta}
          onCopy={copyAction}
          onClose={() => setFullscreen(false)}
        >
          {content}
        </BodyFullscreen>
      ) : (
        content
      )}
    </div>
  );

  function renderPane(): React.JSX.Element {
    if (format.kind === 'image' && partialDocument) {
      return (
        <UnavailableBody
          icon={ImageIcon}
          mediaType={formatMediaType(mediaType)}
          measures={sizeLabel(size, i18n.language)}
          reason={t('body.imageTooLarge')}
          saving={saving}
          onSave={onSave}
          parityId={paneParityId}
        />
      );
    }
    if (mode === 'hex') {
      return <HexView bytes={bytes} compact={compact} parityId={paneParityId} />;
    }
    if (mode === 'tree') {
      return <JsonTreeView root={tree} compact={compact && !fullscreen} parityId={paneParityId} />;
    }
    if (format.kind === 'markdown' && mode === 'default') {
      return <MarkdownView source={text} parityId={paneParityId} />;
    }
    if (format.kind === 'markdown' && mode === 'split') {
      return <MarkdownSplit source={text} parityId={paneParityId} />;
    }
    if (format.kind === 'image') {
      if (imageFailed) {
        return (
          <UnavailableBody
            icon={ImageIcon}
            mediaType={formatMediaType(mediaType)}
            measures={sizeLabel(bytes.byteLength, i18n.language)}
            reason={t('body.imageUndecodable')}
            saving={saving}
            onSave={onSave}
            parityId={paneParityId}
          />
        );
      }
      return (
        <ImageView
          bytes={bytes}
          mediaType={mediaType}
          onLoad={setImageSize}
          onError={() => setImageFailed(true)}
          parityId={paneParityId}
        />
      );
    }
    if (format.kind === 'form' && mode === 'default') {
      return <FormView fields={fields} parityId={paneParityId} />;
    }
    return (
      <CodeViewer
        key={mode}
        ref={viewerRef}
        value={
          mode === 'default' && format.kind === 'code'
            ? displayedFormattedText ?? pretty
            : mode === 'default' ? displayedFormattedText ?? pretty : text
        }
        language={mode === 'raw' && format.kind === 'form' ? 'plaintext' : format.language}
        compact={compact}
        resizable={compact && resizable && !fullscreen}
        automationId={paneAutomationId}
        parityId={paneParityId}
      />
    );
  }
}
