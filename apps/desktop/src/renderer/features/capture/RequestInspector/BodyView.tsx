import { json } from '@codemirror/lang-json';
import { EditorView } from '@codemirror/view';
import CodeMirror from '@uiw/react-codemirror';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { CaptureBodyRef } from '../../../../shared/desktop-api';
import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
import { Segmented } from '../../../components';
import { sizeLabel } from '../utils';
import styles from './BodyView.module.css';

/** 单次预览最多加载的正文字节（Inspector 只做预览，非完整下载）。 */
const PREVIEW_CAP_BYTES = 256 * 1024;

interface BodyViewProps {
  body: CaptureBodyRef;
  compact?: boolean;
  offset?: number;
  previewLimit?: number;
}

interface LoadedBody {
  bytes: Uint8Array;
  end: boolean;
  decodeStatus?: string;
}

export type BodyViewMode = 'auto' | 'text' | 'json' | 'hex';

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
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
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

/** 按需加载并预览一段正文：文本走 CodeMirror（JSON 高亮），二进制走 hex dump。 */
export function BodyView({
  body,
  compact = false,
  offset = 0,
  previewLimit = PREVIEW_CAP_BYTES,
}: BodyViewProps): React.JSX.Element {
  const { i18n, t } = useTranslation();
  const [loaded, setLoaded] = useState<LoadedBody | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<BodyViewMode>('auto');
  const containerRef = useRef<HTMLDivElement>(null);
  const [hexBytesPerLine, setHexBytesPerLine] = useState(16);
  const isDark = document.documentElement.dataset.theme === 'dark'
    || document.documentElement.dataset.theme === 'ember';

  useEffect(() => {
    setLoaded(null);
    setError(null);
    const api = window.interceptor;
    if (!body.bodyHash || body.encodedSize === 0 || !api?.readBody) {
      return;
    }
    let active = true;
    // 解码需完整压缩流：有 content-encoding 时读全压缩正文（Main 端 1MB 上限）并请求
    // Core 解码；否则按预览上限读原始字节。
    const shouldDecode = Boolean(body.contentEncoding);
    const length = shouldDecode
      ? body.encodedSize
      : Math.min(body.encodedSize, previewLimit);
    void api
      .readBody(
        body.bodyHash,
        offset,
        length,
        shouldDecode
          ? { decode: true, encoding: body.contentEncoding }
          : undefined,
      )
      .then((chunk) => {
        if (active) {
          setLoaded({
            bytes: chunk.data,
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
    offset,
    previewLimit,
  ]);

  const previewBytes = useMemo(() => {
    if (!loaded) {
      return null;
    }
    return loaded.bytes.length > previewLimit
      ? loaded.bytes.subarray(0, previewLimit)
      : loaded.bytes;
  }, [loaded, previewLimit]);

  const text = useMemo(() => {
    if (!previewBytes) {
      return null;
    }
    return bodyTextForMode(previewBytes, body.mediaType, mode);
  }, [previewBytes, body.mediaType, mode]);

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
  if (error) {
    return <div className={styles.empty}>{t('capture.failedLoadBody', { error })}</div>;
  }
  if (!loaded) {
    return <div className={styles.empty}>{t('capture.loadingBody')}</div>;
  }

  const truncated = body.encodedSize > previewLimit
    || (loaded ? loaded.bytes.length > previewLimit : false);
  const decodeFailed = loaded?.decodeStatus === 'failed';
  const bodyViewModes = [
    { label: t('capture.auto'), value: 'auto' },
    { label: t('capture.text'), value: 'text' },
    { label: 'JSON', value: 'json' },
    { label: 'Hex', value: 'hex' },
  ];
  const modeControl = (
    <div className={styles.modeBar}>
      <Segmented
        options={bodyViewModes}
        value={mode}
        onChange={(value) => setMode(value as BodyViewMode)}
        automationIds={AUTOMATION_IDS.capture.inspector.bodyMode}
      />
    </div>
  );

  if (text !== null) {
    return (
      <div ref={containerRef} className={`${styles.container}${compact ? ` ${styles.compact}` : ''}`} data-parity="capture-body-view">
        {modeControl}
        {decodeFailed ? (
          <div className={styles.notice}>
            {t('capture.failedDecodeBody', { encoding: body.contentEncoding })}
          </div>
        ) : null}
        {truncated ? (
          <div className={styles.notice}>
            {t('capture.previewLimited', { size: sizeLabel(previewLimit, i18n.language) })}
          </div>
        ) : null}
        <CodeMirror
          value={text.text}
          editable={false}
          theme={isDark ? 'dark' : 'light'}
          extensions={text.json ? [json(), EditorView.lineWrapping] : [EditorView.lineWrapping]}
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
      {decodeFailed ? (
        <div className={styles.notice}>
          {t('capture.failedDecodeBody', { encoding: body.contentEncoding })}
        </div>
      ) : null}
      {truncated ? (
        <div className={styles.notice}>
          {t('capture.binaryPreviewLimited', { size: sizeLabel(previewLimit, i18n.language) })}
        </div>
      ) : null}
      <pre className={styles.hex}>
        {toHexDump(previewBytes ?? loaded.bytes, hexBytesPerLine)}
      </pre>
    </div>
  );
}
