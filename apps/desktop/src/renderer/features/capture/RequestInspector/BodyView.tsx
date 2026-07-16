import { json } from '@codemirror/lang-json';
import { EditorView } from '@codemirror/view';
import CodeMirror from '@uiw/react-codemirror';
import { useEffect, useMemo, useState } from 'react';

import type { CaptureBodyRef } from '../../../../shared/desktop-api';
import styles from './BodyView.module.css';

/** 单次预览最多加载的正文字节（Inspector 只做预览，非完整下载）。 */
const PREVIEW_CAP_BYTES = 256 * 1024;

interface BodyViewProps {
  body: CaptureBodyRef;
  compact?: boolean;
}

interface LoadedBody {
  bytes: Uint8Array;
  end: boolean;
  decodeStatus?: string;
}

function isTextMime(mime: string | undefined): boolean {
  if (!mime) {
    return false;
  }
  const essence = mime.split(';')[0]?.trim().toLowerCase() ?? '';
  return (
    essence.startsWith('text/') ||
    essence === 'application/json' ||
    essence.endsWith('+json') ||
    essence === 'application/javascript' ||
    essence === 'application/xml' ||
    essence.endsWith('+xml') ||
    essence === 'application/x-www-form-urlencoded'
  );
}

function isJsonMime(mime: string | undefined): boolean {
  const essence = mime?.split(';')[0]?.trim().toLowerCase() ?? '';
  return essence === 'application/json' || essence.endsWith('+json');
}

function toHexDump(bytes: Uint8Array): string {
  const lines: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 16) {
    const slice = bytes.subarray(offset, offset + 16);
    const hex = Array.from(slice, (b) => b.toString(16).padStart(2, '0')).join(' ');
    const ascii = Array.from(slice, (b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '.')).join('');
    lines.push(`${offset.toString(16).padStart(8, '0')}  ${hex.padEnd(47, ' ')}  ${ascii}`);
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
export function BodyView({ body, compact = false }: BodyViewProps): React.JSX.Element {
  const [loaded, setLoaded] = useState<LoadedBody | null>(null);
  const [error, setError] = useState<string | null>(null);
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
      : Math.min(body.encodedSize, PREVIEW_CAP_BYTES);
    void api
      .readBody(
        body.bodyHash,
        0,
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
  }, [body.bodyHash, body.encodedSize, body.contentEncoding]);

  const previewBytes = useMemo(() => {
    if (!loaded) {
      return null;
    }
    return loaded.bytes.length > PREVIEW_CAP_BYTES
      ? loaded.bytes.subarray(0, PREVIEW_CAP_BYTES)
      : loaded.bytes;
  }, [loaded]);

  const text = useMemo(() => {
    if (!previewBytes || !isTextMime(body.mediaType)) {
      return null;
    }
    const decoded = new TextDecoder('utf-8', { fatal: false }).decode(previewBytes);
    return isJsonMime(body.mediaType) ? prettyJson(decoded) : decoded;
  }, [previewBytes, body.mediaType]);

  if (!body.bodyHash || body.encodedSize === 0) {
    return <div className={styles.empty}>No body captured.</div>;
  }
  if (error) {
    return <div className={styles.empty}>Failed to load body: {error}</div>;
  }
  if (!loaded) {
    return <div className={styles.empty}>Loading body…</div>;
  }

  const truncated = loaded ? loaded.bytes.length > PREVIEW_CAP_BYTES : false;
  const decodeFailed = loaded?.decodeStatus === 'failed';

  if (text !== null) {
    return (
      <div className={`${styles.container}${compact ? ` ${styles.compact}` : ''}`}>
        {decodeFailed ? (
          <div className={styles.notice}>
            Failed to decode {body.contentEncoding} body; showing raw bytes.
          </div>
        ) : null}
        {truncated ? (
          <div className={styles.notice}>
            Preview limited to first {PREVIEW_CAP_BYTES / 1024} KB.
          </div>
        ) : null}
        <CodeMirror
          value={text}
          editable={false}
          theme={isDark ? 'dark' : 'light'}
          extensions={isJsonMime(body.mediaType) ? [json(), EditorView.lineWrapping] : [EditorView.lineWrapping]}
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
    <div className={`${styles.container}${compact ? ` ${styles.compact}` : ''}`}>
      {decodeFailed ? (
        <div className={styles.notice}>
          Failed to decode {body.contentEncoding} body; showing raw bytes.
        </div>
      ) : null}
      {truncated ? (
        <div className={styles.notice}>
          Preview limited to first {PREVIEW_CAP_BYTES / 1024} KB of binary body.
        </div>
      ) : null}
      <pre className={styles.hex}>{toHexDump(previewBytes ?? loaded.bytes)}</pre>
    </div>
  );
}
