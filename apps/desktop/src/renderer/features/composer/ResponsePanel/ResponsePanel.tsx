import { AlertTriangle, Clock } from 'lucide-react';

import { Chip, StatusBadge, Tabs } from '../../../components';
import type { ComposerResponse } from '../../../../shared/desktop-api';
import { useComposerStore } from '../composerStore';
import styles from './ResponsePanel.module.css';

/** HTTP 状态码短语（缺省时按状态类给出）。 */
function statusLabel(status: number, statusText: string): string {
  if (statusText) {
    return statusText;
  }
  if (status >= 200 && status < 300) return 'OK';
  if (status >= 300 && status < 400) return 'Redirect';
  if (status >= 400 && status < 500) return 'Client error';
  if (status >= 500) return 'Server error';
  return 'No status';
}

function statusTone(status: number): 'green' | 'yellow' | 'red' | 'blue' {
  if (status >= 200 && status < 300) return 'green';
  if (status >= 300 && status < 400) return 'blue';
  if (status >= 400 && status < 500) return 'yellow';
  return 'red';
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function decodeBody(body: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: false }).decode(body);
  } catch {
    return '';
  }
}

function prettyBody(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return text;
  }
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return JSON.stringify(JSON.parse(trimmed), null, 2);
    } catch {
      return text;
    }
  }
  return text;
}

function setCookies(response: ComposerResponse): string[] {
  return response.headers
    .filter((header) => header.name.toLowerCase() === 'set-cookie')
    .map((header) => header.value);
}

/** Right composer pane: response status, metrics and pretty-printed body. */
export function ResponsePanel(): React.JSX.Element {
  const response = useComposerStore((state) => state.response);
  const tab = useComposerStore((state) => state.responseTab);
  const sending = useComposerStore((state) => state.sending);
  const sendError = useComposerStore((state) => state.sendError);
  const setResponseTab = useComposerStore((state) => state.setResponseTab);

  if (sending) {
    return (
      <div className={styles.response}>
        <div className={styles.placeholder}>Sending request…</div>
      </div>
    );
  }

  if (!response) {
    return (
      <div className={styles.response}>
        <div className={styles.placeholder}>
          {sendError ?? 'Send a request to see the response.'}
        </div>
      </div>
    );
  }

  if (!response.ok) {
    return (
      <div className={styles.response}>
        <div className={styles.head}>
          <Chip tone="red">Failed</Chip>
          <span className={styles.spacer} />
          <span className={styles.metric}>
            <Clock size={13} strokeWidth={1.9} />
            {response.durationMs} ms
          </span>
        </div>
        <div className={styles.errorBox}>
          <AlertTriangle size={15} strokeWidth={2} />
          {response.error ?? 'Request failed.'}
        </div>
      </div>
    );
  }

  const bodyText = decodeBody(response.body);
  const cookies = setCookies(response);
  const responseTabs = [
    { id: 'body', label: 'Body' },
    { id: 'headers', label: 'Headers', count: response.headers.length },
    { id: 'cookies', label: 'Cookies', count: cookies.length || undefined },
    { id: 'raw', label: 'Raw' },
  ];

  return (
    <div className={styles.response}>
      <div className={styles.head}>
        <Chip tone={statusTone(response.status)}>{response.status || '—'}</Chip>
        <StatusBadge>{statusLabel(response.status, response.statusText)}</StatusBadge>
        <span className={styles.spacer} />
        <span className={styles.metric}>
          <Clock size={13} strokeWidth={1.9} />
          {response.durationMs} ms
        </span>
        <span className={styles.metric}>{formatBytes(response.totalBytes)}</span>
        <span className={styles.metric}>{response.httpVersion}</span>
      </div>

      <Tabs items={responseTabs} active={tab} onSelect={(id) => setResponseTab(id as never)} />

      {tab === 'body' ? (
        <pre className={styles.bodyText}>
          {prettyBody(bodyText)}
          {response.bodyTruncated ? '\n\n… response truncated (1 MB preview limit)' : ''}
        </pre>
      ) : null}

      {tab === 'headers' ? (
        <div className={styles.hdrList}>
          {response.headers.map((header, index) => (
            <div key={index} className={styles.hdrRow}>
              <span className={styles.hdrName}>{header.name}</span>
              <span className={styles.hdrValue}>{header.value}</span>
            </div>
          ))}
        </div>
      ) : null}

      {tab === 'cookies' ? (
        <div className={styles.hdrList}>
          {cookies.length === 0 ? (
            <div className={styles.placeholder}>No Set-Cookie headers.</div>
          ) : (
            cookies.map((cookie, index) => (
              <div key={index} className={styles.hdrRow}>
                <span className={styles.hdrValue}>{cookie}</span>
              </div>
            ))
          )}
        </div>
      ) : null}

      {tab === 'raw' ? (
        <pre className={styles.bodyText}>
          {`${response.httpVersion} ${response.status} ${response.statusText}`.trim()}
          {'\n'}
          {response.headers.map((header) => `${header.name}: ${header.value}`).join('\n')}
          {'\n\n'}
          {bodyText}
        </pre>
      ) : null}
    </div>
  );
}
