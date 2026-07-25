import { json } from '@codemirror/lang-json';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import CodeMirror from '@uiw/react-codemirror';
import { Copy, Download, FileAudio2, FileVideo2, Info } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  BODY_PREVIEW_MAX_BYTES,
  type CaptureBodyRef,
  type TransferJobSnapshot,
} from '../../../../shared/desktop-api';
import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
import { Button, IconButton, Segmented, useClipboardCopy } from '../../../components';
import { readCompleteBody } from '../data/readCompleteBody';
import { sizeLabel } from '../utils';
import styles from './BodyView.module.css';

/** JSON 语法高亮：纯文本色（key 紫 / string 绿 / number-bool-null 蓝 / 标点浅灰），
 *  无 token 背景，1:1 对应 design/app/app.css 的 .jsonv jk/js/jn/jp。 */
const jsonHighlightStyle = HighlightStyle.define([
  { tag: tags.propertyName, color: 'var(--purple)' },
  { tag: tags.string, color: 'var(--green)' },
  { tag: [tags.number, tags.bool, tags.null], color: 'var(--blue)' },
  {
    tag: [tags.punctuation, tags.separator, tags.bracket, tags.squareBracket, tags.brace],
    color: 'var(--text-3)',
    backgroundColor: 'transparent',
  },
]);

/** 编辑器外观（前景/gutter/选区）取代 CodeMirror 内置 light/dark 预设，改走设计 token。 */
function createEditorTheme(dark: boolean): Extension {
  return EditorView.theme({
    '&': { color: 'var(--text)', backgroundColor: 'transparent' },
    '.cm-content': { caretColor: 'var(--text)' },
    '.cm-gutters': { backgroundColor: 'transparent', color: 'var(--text-3)', border: 'none' },
    '.cm-activeLine': { backgroundColor: 'transparent' },
    '.cm-activeLineGutter': { backgroundColor: 'transparent' },
    '.cm-selectionBackground, .cm-content ::selection': { backgroundColor: 'var(--sel) !important' },
  }, { dark });
}

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

export type BodyViewMode = 'auto' | 'text' | 'json' | 'hex';

export interface BodyPreviewRequest {
  length: number;
  decode: boolean;
  limited: boolean;
}

/** 计算安全的正文预览读取范围；压缩输入不完整时禁止尝试解码。 */
export function bodyPreviewRequest(body: CaptureBodyRef): BodyPreviewRequest {
  const length = Math.min(body.encodedSize, BODY_PREVIEW_MAX_BYTES);
  const encodings = body.contentEncoding
    ?.split(',')
    .map((encoding) => encoding.trim().toLowerCase())
    .filter((encoding) => encoding && encoding !== 'identity') ?? [];
  return {
    length,
    decode: encodings.length > 0,
    limited: body.encodedSize > length,
  };
}

export function isTextMime(mime: string | undefined): boolean {
  if (!mime) {
    return false;
  }
  const essence = mime.split(';')[0]?.trim().toLowerCase() ?? '';
  return (
    essence.startsWith('text/') ||
    essence === 'application/json' ||
    essence.endsWith('+json') ||
    essence === 'application/javascript' ||
    essence === 'application/x-javascript' ||
    essence === 'application/ecmascript' ||
    essence === 'application/xml' ||
    essence.endsWith('+xml') ||
    essence === 'application/x-www-form-urlencoded' ||
    essence === 'application/graphql' ||
    essence === 'application/yaml' ||
    essence === 'application/x-yaml' ||
    essence.endsWith('+yaml') ||
    essence === 'application/x-ndjson' ||
    essence === 'application/json-seq' ||
    essence === 'application/x-json-stream'
  );
}

/** 音视频正文不进入 Renderer 预览，只允许 Core 流式保存。 */
export function isMediaMime(mime: string | undefined): boolean {
  const essence = mime?.split(';', 1)[0]?.trim().toLowerCase() ?? '';
  return essence.startsWith('video/') || essence.startsWith('audio/');
}

export function isJsonMime(mime: string | undefined): boolean {
  const essence = mime?.split(';')[0]?.trim().toLowerCase() ?? '';
  return essence === 'application/json'
    || essence.endsWith('+json')
    || essence === 'application/x-ndjson'
    || essence === 'application/json-seq'
    || essence === 'application/x-json-stream';
}

/** Unknown MIME falls back to text only for valid UTF-8 with no binary controls. */
export function detectTextBody(
  bytes: Uint8Array,
  mime: string | undefined,
): { text: string; json: boolean } | null {
  let decoded: string;
  try {
    decoded = new TextDecoder('utf-8', { fatal: !isTextMime(mime) }).decode(bytes);
  } catch {
    return null;
  }
  if (!isTextMime(mime)) {
    for (const character of decoded) {
      const code = character.charCodeAt(0);
      if (code < 32 && character !== '\n' && character !== '\r' && character !== '\t') {
        return null;
      }
    }
  }
  const trimmed = decoded.trim();
  const json = isJsonMime(mime) || (
    (trimmed.startsWith('{') || trimmed.startsWith('['))
    && (() => {
      try {
        JSON.parse(trimmed);
        return true;
      } catch {
        return false;
      }
    })()
  );
  return { text: json ? prettyJson(decoded) : decoded, json };
}

/** Resolve the selected display mode without hiding malformed text from the user. */
export function bodyTextForMode(
  bytes: Uint8Array,
  mime: string | undefined,
  mode: BodyViewMode,
): { text: string; json: boolean } | null {
  if (mode === 'hex') {
    return null;
  }
  if (mode === 'auto') {
    return detectTextBody(bytes, mime);
  }
  const decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  return mode === 'json'
    ? { text: prettyJson(decoded), json: true }
    : { text: decoded, json: false };
}

export function toHexDump(bytes: Uint8Array, bytesPerLine = 16): string {
  const lines: string[] = [];
  const lineWidth = Math.max(4, bytesPerLine);
  for (let offset = 0; offset < bytes.length; offset += lineWidth) {
    const slice = bytes.subarray(offset, offset + lineWidth);
    const hex = Array.from(slice, (b) => b.toString(16).padStart(2, '0')).join(' ');
    const ascii = Array.from(slice, (b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '.')).join('');
    lines.push(
      `${offset.toString(16).padStart(8, '0')}  ${hex.padEnd(lineWidth * 3 - 1, ' ')}  ${ascii}`,
    );
  }
  return lines.join('\n');
}

function prettyJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

/** 按需加载有限正文预览：文本走 CodeMirror（JSON 高亮），二进制走 hex dump。 */
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
  const isDark = document.documentElement.dataset.theme === 'dark'
    || document.documentElement.dataset.theme === 'ember';
  const editorTheme = useMemo(() => createEditorTheme(isDark), [isDark]);
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
        <CodeMirror
          value={text.text}
          editable={false}
          theme={editorTheme}
          extensions={text.json
            ? [json(), syntaxHighlighting(jsonHighlightStyle), EditorView.lineWrapping]
            : [EditorView.lineWrapping]}
          basicSetup={{
            lineNumbers: !compact,
            foldGutter: false,
            highlightActiveLine: false,
          }}
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
