import { Send, X } from 'lucide-react';

import {
  Button,
  Checkbox,
  Count,
  cx,
  IconButton,
  InputBox,
  Segmented,
  Select,
  Tabs,
} from '../../../components';
import type { ComposerProtocol } from '../composerStore';
import { parseQueryParams, useComposerStore } from '../composerStore';
import { sendComposerRequest } from '../useComposer';
import styles from './RequestBuilder.module.css';

const METHOD_OPTIONS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].map(
  (method) => ({ value: method, label: method }),
);

const PROTOCOL_LABELS: Record<ComposerProtocol, string> = {
  auto: 'Auto',
  'http/1.1': 'HTTP/1.1',
  h2: 'HTTP/2',
};
const LABEL_TO_PROTOCOL: Record<string, ComposerProtocol> = {
  Auto: 'auto',
  'HTTP/1.1': 'http/1.1',
  'HTTP/2': 'h2',
};

const AUTH_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'bearer', label: 'Bearer' },
  { value: 'basic', label: 'Basic' },
];

/** Left composer pane: method + URL, protocol and the request tabs/headers. */
export function RequestBuilder(): React.JSX.Element {
  const method = useComposerStore((state) => state.method);
  const url = useComposerStore((state) => state.url);
  const protocol = useComposerStore((state) => state.protocol);
  const headers = useComposerStore((state) => state.headers);
  const body = useComposerStore((state) => state.body);
  const auth = useComposerStore((state) => state.auth);
  const tab = useComposerStore((state) => state.requestTab);
  const sending = useComposerStore((state) => state.sending);
  const response = useComposerStore((state) => state.response);
  const setMethod = useComposerStore((state) => state.setMethod);
  const setUrl = useComposerStore((state) => state.setUrl);
  const setProtocol = useComposerStore((state) => state.setProtocol);
  const setBody = useComposerStore((state) => state.setBody);
  const setAuth = useComposerStore((state) => state.setAuth);
  const setRequestTab = useComposerStore((state) => state.setRequestTab);
  const addHeader = useComposerStore((state) => state.addHeader);
  const updateHeader = useComposerStore((state) => state.updateHeader);
  const removeHeader = useComposerStore((state) => state.removeHeader);
  const setQueryParams = useComposerStore((state) => state.setQueryParams);

  const enabledHeaders = headers.filter((header) => header.on).length;
  const queryParams = parseQueryParams(url);
  const tlsLabel = response?.tls
    ? `${response.tls.protocol || 'TLS'} · ${response.tls.alpn}`
    : response
      ? response.httpVersion
      : '—';

  const requestTabs = [
    { id: 'headers', label: 'Headers', count: enabledHeaders },
    { id: 'query', label: 'Query', count: queryParams.length || undefined },
    { id: 'body', label: 'Body' },
    { id: 'auth', label: 'Auth' },
  ];

  return (
    <div className={styles.builder}>
      <div className={styles.urlrow}>
        <Select
          className={styles.method}
          ariaLabel="Method"
          value={method}
          options={METHOD_OPTIONS}
          onValueChange={setMethod}
        />
        <InputBox
          className={styles.url}
          ariaLabel="Request URL"
          value={url}
          placeholder="https://example.com/path"
          onValueChange={setUrl}
        />
        <Button
          icon={Send}
          variant="primary"
          disabled={sending}
          onClick={() => void sendComposerRequest()}
        >
          {sending ? 'Sending…' : 'Send'}
        </Button>
      </div>

      <div className={styles.subrow}>
        <span className={styles.protocolLabel}>Protocol</span>
        <Segmented
          options={['Auto', 'HTTP/1.1', 'HTTP/2']}
          value={PROTOCOL_LABELS[protocol]}
          onChange={(label) => setProtocol(LABEL_TO_PROTOCOL[label] ?? 'auto')}
        />
        <span className={styles.spacer} />
        <Count>{tlsLabel}</Count>
      </div>

      <Tabs items={requestTabs} active={tab} onSelect={(id) => setRequestTab(id as never)} />

      {tab === 'headers' ? (
        <div className={styles.headers}>
          <div className={styles.head}>
            <span />
            <span>Name</span>
            <span>Value</span>
            <span />
          </div>
          {headers.map((header) => (
            <div key={header.id} className={styles.row}>
              <Checkbox
                checked={header.on}
                onChange={(on) => updateHeader(header.id, { on })}
              />
              <input
                className={styles.cellInput}
                aria-label="Header name"
                value={header.name}
                placeholder="header-name"
                spellCheck={false}
                onChange={(event) => updateHeader(header.id, { name: event.target.value })}
              />
              <input
                className={styles.cellInput}
                aria-label="Header value"
                value={header.value}
                placeholder="value"
                spellCheck={false}
                onChange={(event) => updateHeader(header.id, { value: event.target.value })}
              />
              <IconButton
                icon={X}
                label="Remove header"
                size="sm"
                strokeWidth={2.2}
                onClick={() => removeHeader(header.id)}
              />
            </div>
          ))}
          <button type="button" className={cx(styles.row, styles.add)} onClick={addHeader}>
            <span className={styles.plus}>+</span>
            <span className={styles.name}>Add header…</span>
            <span className={styles.value} />
            <span />
          </button>
        </div>
      ) : null}

      {tab === 'query' ? (
        <div className={styles.headers}>
          <div className={styles.head}>
            <span />
            <span>Name</span>
            <span>Value</span>
            <span />
          </div>
          {queryParams.map((param, index) => (
            <div key={index} className={styles.row}>
              <span />
              <input
                className={styles.cellInput}
                aria-label="Query name"
                value={param.name}
                spellCheck={false}
                onChange={(event) => {
                  const next = queryParams.slice();
                  next[index] = { name: event.target.value, value: param.value };
                  setQueryParams(next);
                }}
              />
              <input
                className={styles.cellInput}
                aria-label="Query value"
                value={param.value}
                spellCheck={false}
                onChange={(event) => {
                  const next = queryParams.slice();
                  next[index] = { name: param.name, value: event.target.value };
                  setQueryParams(next);
                }}
              />
              <IconButton
                icon={X}
                label="Remove query param"
                size="sm"
                strokeWidth={2.2}
                onClick={() => setQueryParams(queryParams.filter((_, position) => position !== index))}
              />
            </div>
          ))}
          <button
            type="button"
            className={cx(styles.row, styles.add)}
            onClick={() => setQueryParams([...queryParams, { name: '', value: '' }])}
          >
            <span className={styles.plus}>+</span>
            <span className={styles.name}>Add parameter…</span>
            <span className={styles.value} />
            <span />
          </button>
        </div>
      ) : null}

      {tab === 'body' ? (
        <div className={styles.bodyPane}>
          <textarea
            className={styles.textarea}
            aria-label="Request body"
            value={body}
            placeholder="Request body (JSON, text, …)"
            spellCheck={false}
            onChange={(event) => setBody(event.target.value)}
          />
        </div>
      ) : null}

      {tab === 'auth' ? (
        <div className={styles.authPane}>
          <div className={styles.authRow}>
            <span className={styles.authLabel}>Type</span>
            <Select
              className={styles.authType}
              ariaLabel="Auth type"
              value={auth.type}
              options={AUTH_OPTIONS}
              onValueChange={(value) => setAuth({ type: value as never })}
            />
          </div>
          {auth.type === 'bearer' ? (
            <div className={styles.authRow}>
              <span className={styles.authLabel}>Token</span>
              <InputBox
                className={styles.authField}
                ariaLabel="Bearer token"
                value={auth.token}
                placeholder="token"
                onValueChange={(token) => setAuth({ token })}
              />
            </div>
          ) : null}
          {auth.type === 'basic' ? (
            <>
              <div className={styles.authRow}>
                <span className={styles.authLabel}>Username</span>
                <InputBox
                  className={styles.authField}
                  ariaLabel="Username"
                  value={auth.username}
                  onValueChange={(username) => setAuth({ username })}
                />
              </div>
              <div className={styles.authRow}>
                <span className={styles.authLabel}>Password</span>
                <InputBox
                  className={styles.authField}
                  ariaLabel="Password"
                  value={auth.password}
                  onValueChange={(password) => setAuth({ password })}
                />
              </div>
            </>
          ) : null}
          {auth.type === 'none' ? (
            <div className={styles.authNote}>No authorization header added.</div>
          ) : (
            <div className={styles.authNote}>Adds an authorization header when you send.</div>
          )}
        </div>
      ) : null}
    </div>
  );
}
