import { Lock, Shield } from 'lucide-react';
import { Fragment, type ReactNode, useState } from 'react';

import { cx, SectionHeader, StatusBadge } from '../../../components';
import { INSPECTOR_TABS, type InspectorTab } from '../data';
import styles from './RequestInspector.module.css';

type KvRow = [key: string, value: ReactNode, accent?: 'a' | 'g'];

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

  return (
    <div className={styles.inspector}>
      <div className={styles.head}>
        <span className={styles.methodChip}>GET</span>
        <span className={styles.url}>
          <span className={styles.urlDomain}>api.github.com</span>
          <span className={styles.urlPath}>/user</span>
        </span>
        <StatusBadge>200 OK</StatusBadge>
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
              <Kv
                rows={[
                  ['Request URL', 'https://api.github.com/user'],
                  ['Request Method', 'GET', 'a'],
                  ['Status Code', '200 OK', 'g'],
                  ['Remote Address', '140.82.112.3:443'],
                  ['Protocol', 'HTTP/2 · TLS 1.3'],
                  ['Referrer Policy', 'strict-origin-when-cross-origin'],
                ]}
              />
            </Section>
            <Section title="Response Headers" count={12}>
              <Kv
                rows={[
                  ['cache-control', 'private, max-age=60, s-maxage=60'],
                  ['content-encoding', 'gzip'],
                  ['content-type', 'application/json; charset=utf-8'],
                  ['date', 'Fri, 10 Jul 2026 12:00:00 GMT'],
                  ['server', 'GitHub.com'],
                  ['strict-transport-security', 'max-age=31536000; includeSubDomains'],
                ]}
              />
            </Section>
            <Section title="Request Headers" count={8}>
              <Kv
                rows={[
                  ['accept', 'application/vnd.github.v3+json'],
                  ['accept-encoding', 'gzip, deflate, br'],
                  ['authorization', 'Bearer github_pat_11A…', 'a'],
                  ['user-agent', 'Interceptor/1.0.0 (macOS; arm64)'],
                ]}
              />
            </Section>
          </div>
        ) : null}

        {tab === 'request' ? (
          <div className={styles.panel}>
            <Section title="Request line">
              <Kv
                rows={[
                  ['Method', 'GET', 'a'],
                  ['Path', '/user'],
                  ['Version', 'HTTP/2'],
                  ['Scheme', 'https', 'g'],
                ]}
              />
            </Section>
            <Section title="Query String Parameters" count={0}>
              <div className={styles.empty}>No query parameters on this request.</div>
            </Section>
            <Section title="Request Payload">
              <div className={styles.empty}>GET requests carry no body.</div>
            </Section>
          </div>
        ) : null}

        {tab === 'response' ? (
          <div className={styles.panel}>
            <Section title="Body" count="application/json · 1.2 KB">
              <div className={styles.body}>
                {'{'}
                <br />
                &nbsp;&nbsp;<span className={styles.jsonKey}>&quot;login&quot;</span>
                <span className={styles.jsonPunct}>:</span>{' '}
                <span className={styles.jsonString}>&quot;octocat&quot;</span>
                <span className={styles.jsonPunct}>,</span>
                <br />
                &nbsp;&nbsp;<span className={styles.jsonKey}>&quot;id&quot;</span>
                <span className={styles.jsonPunct}>:</span>{' '}
                <span className={styles.jsonNumber}>583231</span>
                <span className={styles.jsonPunct}>,</span>
                <br />
                &nbsp;&nbsp;<span className={styles.jsonKey}>&quot;type&quot;</span>
                <span className={styles.jsonPunct}>:</span>{' '}
                <span className={styles.jsonString}>&quot;User&quot;</span>
                <span className={styles.jsonPunct}>,</span>
                <br />
                &nbsp;&nbsp;<span className={styles.jsonKey}>&quot;name&quot;</span>
                <span className={styles.jsonPunct}>:</span>{' '}
                <span className={styles.jsonString}>&quot;The Octocat&quot;</span>
                <span className={styles.jsonPunct}>,</span>
                <br />
                &nbsp;&nbsp;<span className={styles.jsonKey}>&quot;company&quot;</span>
                <span className={styles.jsonPunct}>:</span>{' '}
                <span className={styles.jsonString}>&quot;@github&quot;</span>
                <span className={styles.jsonPunct}>,</span>
                <br />
                &nbsp;&nbsp;<span className={styles.jsonKey}>&quot;location&quot;</span>
                <span className={styles.jsonPunct}>:</span>{' '}
                <span className={styles.jsonString}>&quot;San Francisco&quot;</span>
                <span className={styles.jsonPunct}>,</span>
                <br />
                &nbsp;&nbsp;<span className={styles.jsonKey}>&quot;public_repos&quot;</span>
                <span className={styles.jsonPunct}>:</span>{' '}
                <span className={styles.jsonNumber}>8</span>
                <span className={styles.jsonPunct}>,</span>
                <br />
                &nbsp;&nbsp;<span className={styles.jsonKey}>&quot;followers&quot;</span>
                <span className={styles.jsonPunct}>:</span>{' '}
                <span className={styles.jsonNumber}>9999</span>
                <br />
                {'}'}
              </div>
            </Section>
          </div>
        ) : null}

        {tab === 'timing' ? (
          <div className={styles.panel}>
            <Section title="Timing" count="142 ms total">
              <div className={styles.timeline}>
                {[
                  ['Stalled', '2 ms', 0, 2],
                  ['DNS lookup', '8 ms', 2, 6],
                  ['Initial connection', '20 ms', 8, 14],
                  ['SSL / TLS', '18 ms', 22, 13],
                  ['Request sent', '1 ms', 35, 1.5],
                  ['Waiting (TTFB)', '69 ms', 36, 48],
                  ['Content download', '24 ms', 84, 16],
                ].map(([label, ms, left, width], index) => (
                  <div key={index} className={styles.timelineRow}>
                    <span className={styles.timelineLabel}>{label}</span>
                    <span className={styles.timelineTime}>{ms}</span>
                    <span className={styles.timelineBar}>
                      <i style={{ left: `${left}%`, width: `${width}%` }} />
                    </span>
                  </div>
                ))}
              </div>
            </Section>
          </div>
        ) : null}

        {tab === 'cookies' ? (
          <div className={styles.panel}>
            <Section title="Request Cookies" count={2}>
              <Kv
                rows={[
                  ['_device_id', '8f2a9c1b4e…'],
                  ['logged_in', 'yes', 'g'],
                ]}
              />
            </Section>
            <Section title="Response Cookies" count={1}>
              <Kv
                rows={[
                  ['_gh_sess', 'VszN7pQ…9Qb2'],
                  ['Domain', '.github.com'],
                  ['Path', '/'],
                  ['Expires', 'Session'],
                  ['Flags', 'HttpOnly · Secure · SameSite=Lax', 'a'],
                ]}
              />
            </Section>
          </div>
        ) : null}

        {tab === 'tls' ? (
          <div className={styles.panel}>
            <Section title="Secure connection">
              <Kv
                rows={[
                  ['Protocol', 'TLS 1.3', 'g'],
                  ['Cipher suite', 'TLS_AES_128_GCM_SHA256'],
                  ['Key exchange', 'X25519'],
                  ['ALPN', 'h2'],
                  ['SNI', 'api.github.com'],
                ]}
              />
            </Section>
            <Section title="Certificate chain" count={3}>
              <div className={styles.certs}>
                <div className={styles.cert}>
                  <Lock size={16} strokeWidth={2.2} />
                  <span className={styles.certInfo}>
                    <b>api.github.com</b>
                    <span>SAN *.github.com · valid to 2027-02-11</span>
                  </span>
                  <span className={styles.certChain}>leaf</span>
                </div>
                <div className={styles.cert}>
                  <Shield size={16} strokeWidth={1.9} />
                  <span className={styles.certInfo}>
                    <b>DigiCert TLS Hybrid ECC SHA384 2020 CA1</b>
                    <span>intermediate · issued by DigiCert Global Root</span>
                  </span>
                  <span className={styles.certChain}>CA</span>
                </div>
                <div className={styles.cert}>
                  <Shield size={16} strokeWidth={1.9} />
                  <span className={styles.certInfo}>
                    <b>DigiCert Global Root CA</b>
                    <span>root · trusted in system store</span>
                  </span>
                  <span className={styles.certChain}>root</span>
                </div>
              </div>
            </Section>
          </div>
        ) : null}
      </div>
    </div>
  );
}
