import { Fragment, type ReactNode, useState } from 'react';

import type { CaptureHeader } from '../../../../shared/desktop-api';
import { cx, SectionHeader, StatusBadge } from '../../../components';
import { useCaptureStore } from '../captureStore';
import { INSPECTOR_TABS, type InspectorTab } from '../data';
import {
  protocolLabel,
  sizeLabel,
  statusLabel,
  statusTone,
  timeLabel,
  typeLabel,
} from '../row-format';
import { useExchangeDetail } from '../useExchangeDetail';
import { BodyView } from './BodyView';
import styles from './RequestInspector.module.css';

type KvRow = [key: string, value: ReactNode, accent?: 'a' | 'g'];

function headersToRows(headers: CaptureHeader[]): KvRow[] {
  return headers.map((header) => [header.name, header.value]);
}

/** 从绝对/相对 URL 提取查询参数为 KV 行。 */
function queryRows(url: string): KvRow[] {
  const search = url.includes('?') ? url.slice(url.indexOf('?') + 1) : '';
  if (!search) {
    return [];
  }
  const params = new URLSearchParams(search);
  return Array.from(params.entries(), ([key, value]) => [key, value] as KvRow);
}

/** 解析请求 Cookie 头（name=value; …）为 KV 行。 */
function requestCookieRows(headers: CaptureHeader[]): KvRow[] {
  const cookie = headers.find((header) => header.name.toLowerCase() === 'cookie');
  if (!cookie) {
    return [];
  }
  return cookie.value
    .split(';')
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const eq = pair.indexOf('=');
      return eq === -1
        ? ([pair, ''] as KvRow)
        : ([pair.slice(0, eq), pair.slice(eq + 1)] as KvRow);
    });
}

/** 收集响应 Set-Cookie 头（每条一行）为 KV 行。 */
function responseCookieRows(headers: CaptureHeader[]): KvRow[] {
  return headers
    .filter((header) => header.name.toLowerCase() === 'set-cookie')
    .map((header) => {
      const eq = header.value.indexOf('=');
      const name = eq === -1 ? header.value : header.value.slice(0, eq);
      return [name, header.value] as KvRow;
    });
}

function Kv({ rows }: { rows: KvRow[] }): React.JSX.Element {
  return (
    <div className={styles.kv}>
      {rows.map(([key, value, accent], index) => (
        <Fragment key={index}>
          <span className={styles.key}>{key}</span>
          <span
            className={cx(styles.value, accent === 'a' && styles.accent, accent === 'g' && styles.good)}
          >
            {value}
          </span>
        </Fragment>
      ))}
    </div>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count?: ReactNode;
  children?: ReactNode;
}): React.JSX.Element {
  return (
    <div>
      <SectionHeader count={count}>{title}</SectionHeader>
      {children}
    </div>
  );
}

/** Right-hand inspector for the selected request. */
export function RequestInspector(): React.JSX.Element {
  const [tab, setTab] = useState<InspectorTab>('headers');
  const selectedId = useCaptureStore((state) => state.selectedId);
  const summary = useCaptureStore((state) => {
    if (!state.selectedId) {
      return undefined;
    }
    const index = state.indexById.get(state.selectedId);
    return index === undefined ? undefined : state.rows[index];
  });
  const { detail } = useExchangeDetail(selectedId);

  const view = detail?.summary ?? summary;

  const url = view ? detail?.url ?? `${view.host ?? ''}${view.path ?? ''}` : '';
  const responseHeaders = detail?.responseHeaders ?? [];
  const requestHeaders = detail?.requestHeaders ?? [];
  const scheme = detail?.scheme ?? (view?.secure ? 'https' : 'http');
  const statusText = view
    ? view.statusCode !== undefined
      ? `${view.statusCode}${detail?.statusText ? ` ${detail.statusText}` : ''}`
      : statusLabel(view)
    : '';

  return (
    <div className={styles.inspector}>
      <div className={styles.head}>
        {view ? (
          <span className={styles.methodChip}>{view.method.toUpperCase()}</span>
        ) : null}
        <span className={styles.url}>
          {view ? (
            <>
              <span className={styles.urlDomain}>{view.host ?? ''}</span>
              <span className={styles.urlPath}>{view.path ?? ''}</span>
            </>
          ) : (
            <span className={styles.urlDomain}>Select a request to inspect.</span>
          )}
        </span>
        {view && view.statusCode !== undefined ? (
          <StatusBadge tone={statusTone(view.statusCode)}>{statusText}</StatusBadge>
        ) : null}
      </div>

      <div className={styles.tabs}>
        {INSPECTOR_TABS.map(({ id, label }) => (
          <span key={id} className={cx(tab === id && styles.active)} onClick={() => setTab(id)}>
            {label}
          </span>
        ))}
      </div>

      <div className={styles.scroll}>
        {tab === 'headers' ? (
          <div className={styles.panel}>
            <Section title="General">
              {view ? (
                <Kv
                  rows={[
                    ['Request URL', url],
                    ['Request Method', view.method.toUpperCase(), 'a'],
                    ['Status Code', statusText, view.statusCode && view.statusCode < 400 ? 'g' : undefined],
                    ['Protocol', protocolLabel(view.protocol).toUpperCase()],
                    ['Host', view.host ?? '—'],
                    ['Duration', timeLabel(view)],
                  ]}
                />
              ) : (
                <div className={styles.empty}>Select a request to inspect.</div>
              )}
            </Section>
            <Section title="Response Headers" count={responseHeaders.length}>
              {responseHeaders.length ? (
                <Kv rows={headersToRows(responseHeaders)} />
              ) : (
                <div className={styles.empty}>No response headers captured.</div>
              )}
            </Section>
            <Section title="Request Headers" count={requestHeaders.length}>
              {requestHeaders.length ? (
                <Kv rows={headersToRows(requestHeaders)} />
              ) : (
                <div className={styles.empty}>No request headers captured.</div>
              )}
            </Section>
          </div>
        ) : null}

        {tab === 'request' ? (
          <div className={styles.panel}>
            <Section title="Request line">
              {view ? (
                <Kv
                  rows={[
                    ['Method', view.method.toUpperCase(), 'a'],
                    ['Path', view.path ?? '/'],
                    ['Version', protocolLabel(view.protocol).toUpperCase()],
                    ['Scheme', scheme, 'g'],
                  ]}
                />
              ) : (
                <div className={styles.empty}>Select a request to inspect.</div>
              )}
            </Section>
            <Section title="Query String Parameters" count={queryRows(url).length}>
              {queryRows(url).length ? (
                <Kv rows={queryRows(url)} />
              ) : (
                <div className={styles.empty}>No query parameters on this request.</div>
              )}
            </Section>
            <Section title="Request Payload">
              {detail?.requestBody ? (
                <BodyView body={detail.requestBody} />
              ) : (
                <div className={styles.empty}>This request carries no body.</div>
              )}
            </Section>
          </div>
        ) : null}

        {tab === 'response' ? (
          <div className={styles.panel}>
            <Section
              title="Body"
              count={
                detail?.responseBody
                  ? `${typeLabel(view?.responseMime)} · ${sizeLabel(view?.responseBytes ?? 0)}`
                  : undefined
              }
            >
              {detail?.responseBody ? (
                <BodyView body={detail.responseBody} />
              ) : (
                <div className={styles.empty}>No response body captured.</div>
              )}
            </Section>
          </div>
        ) : null}

        {tab === 'timing' ? (
          <div className={styles.panel}>
            <Section title="Timing" count={view ? timeLabel(view) : undefined}>
              {view ? (
                <Kv
                  rows={[
                    ['Started', new Date(view.startedAt).toISOString()],
                    ['Total', timeLabel(view)],
                    ['Request bytes', sizeLabel(view.requestBytes)],
                    ['Response bytes', sizeLabel(view.responseBytes)],
                  ]}
                />
              ) : (
                <div className={styles.empty}>Select a request to inspect.</div>
              )}
              <div className={styles.empty}>
                Per-phase waterfall (DNS, connect, TLS, TTFB) arrives with connection
                instrumentation in a later milestone.
              </div>
            </Section>
          </div>
        ) : null}

        {tab === 'cookies' ? (
          <div className={styles.panel}>
            <Section title="Request Cookies" count={requestCookieRows(requestHeaders).length}>
              {requestCookieRows(requestHeaders).length ? (
                <Kv rows={requestCookieRows(requestHeaders)} />
              ) : (
                <div className={styles.empty}>No request cookies.</div>
              )}
            </Section>
            <Section title="Response Cookies" count={responseCookieRows(responseHeaders).length}>
              {responseCookieRows(responseHeaders).length ? (
                <Kv rows={responseCookieRows(responseHeaders)} />
              ) : (
                <div className={styles.empty}>No response cookies.</div>
              )}
            </Section>
          </div>
        ) : null}

        {tab === 'tls' ? (
          <div className={styles.panel}>
            <Section title="Secure connection">
              {!view ? (
                <div className={styles.empty}>Select a request to inspect.</div>
              ) : view.secure ? (
                <Kv
                  rows={[
                    ['Scheme', scheme, 'g'],
                    ['Host', view.host ?? '—'],
                  ]}
                />
              ) : (
                <div className={styles.empty}>This exchange was sent over plaintext HTTP.</div>
              )}
            </Section>
            <Section title="Certificate chain">
              <div className={styles.empty}>
                TLS handshake and certificate inspection become available after enabling
                HTTPS decryption.
              </div>
            </Section>
          </div>
        ) : null}
      </div>
    </div>
  );
}
