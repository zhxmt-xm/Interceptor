import { Send, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

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

/** Left composer pane: method + URL, protocol and the request tabs/headers. */
export function RequestBuilder(): React.JSX.Element {
  const { t } = useTranslation();
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
    { id: 'headers', label: t('composer.headers'), count: enabledHeaders },
    { id: 'query', label: t('composer.query'), count: queryParams.length || undefined },
    { id: 'body', label: t('composer.body') },
    { id: 'auth', label: t('composer.auth') },
  ];

  return (
    <div className={styles.builder}>
      <div className={styles.urlrow}>
        <Select
          className={styles.method}
          ariaLabel={t('composer.method')}
          value={method}
          options={METHOD_OPTIONS}
          onValueChange={setMethod}
        />
        <InputBox
          className={styles.url}
          ariaLabel={t('composer.requestUrl')}
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
          {sending ? t('composer.sending') : t('composer.send')}
        </Button>
      </div>

      <div className={styles.subrow}>
        <span className={styles.protocolLabel}>{t('composer.protocol')}</span>
        <Segmented
          options={[
            { value: 'auto', label: t('composer.auto') },
            { value: 'http/1.1', label: 'HTTP/1.1' },
            { value: 'h2', label: 'HTTP/2' },
          ]}
          value={protocol}
          onChange={(value) => setProtocol(value as ComposerProtocol)}
        />
        <span className={styles.spacer} />
        <Count>{tlsLabel}</Count>
      </div>

      <Tabs items={requestTabs} active={tab} onSelect={(id) => setRequestTab(id as never)} />

      {tab === 'headers' ? (
        <div className={styles.headers}>
          <div className={styles.head}>
            <span />
            <span>{t('composer.name')}</span>
            <span>{t('composer.value')}</span>
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
                aria-label={t('composer.headerName')}
                value={header.name}
                placeholder="header-name"
                spellCheck={false}
                onChange={(event) => updateHeader(header.id, { name: event.target.value })}
              />
              <input
                className={styles.cellInput}
                aria-label={t('composer.headerValue')}
                value={header.value}
                placeholder="value"
                spellCheck={false}
                onChange={(event) => updateHeader(header.id, { value: event.target.value })}
              />
              <IconButton
                icon={X}
                label={t('composer.removeHeader')}
                size="sm"
                strokeWidth={2.2}
                onClick={() => removeHeader(header.id)}
              />
            </div>
          ))}
          <button type="button" className={cx(styles.row, styles.add)} onClick={addHeader}>
            <span className={styles.plus}>+</span>
            <span className={styles.name}>{t('composer.addHeader')}</span>
            <span className={styles.value} />
            <span />
          </button>
        </div>
      ) : null}

      {tab === 'query' ? (
        <div className={styles.headers}>
          <div className={styles.head}>
            <span />
            <span>{t('composer.name')}</span>
            <span>{t('composer.value')}</span>
            <span />
          </div>
          {queryParams.map((param, index) => (
            <div key={index} className={styles.row}>
              <span />
              <input
                className={styles.cellInput}
                aria-label={t('composer.queryName')}
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
                aria-label={t('composer.queryValue')}
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
                label={t('composer.removeQuery')}
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
            <span className={styles.name}>{t('composer.addParameter')}</span>
            <span className={styles.value} />
            <span />
          </button>
        </div>
      ) : null}

      {tab === 'body' ? (
        <div className={styles.bodyPane}>
          <textarea
            className={styles.textarea}
            aria-label={t('composer.requestBody')}
            value={body}
            placeholder={t('composer.requestBodyPlaceholder')}
            spellCheck={false}
            onChange={(event) => setBody(event.target.value)}
          />
        </div>
      ) : null}

      {tab === 'auth' ? (
        <div className={styles.authPane}>
          <div className={styles.authRow}>
            <span className={styles.authLabel}>{t('composer.type')}</span>
            <Select
              className={styles.authType}
              ariaLabel={t('composer.authType')}
              value={auth.type}
              options={[
                { value: 'none', label: t('composer.none') },
                { value: 'bearer', label: t('composer.bearer') },
                { value: 'basic', label: t('composer.basic') },
              ]}
              onValueChange={(value) => setAuth({ type: value as never })}
            />
          </div>
          {auth.type === 'bearer' ? (
            <div className={styles.authRow}>
              <span className={styles.authLabel}>{t('composer.token')}</span>
              <InputBox
                className={styles.authField}
                ariaLabel={t('composer.bearerToken')}
                value={auth.token}
                placeholder="token"
                onValueChange={(token) => setAuth({ token })}
              />
            </div>
          ) : null}
          {auth.type === 'basic' ? (
            <>
              <div className={styles.authRow}>
                <span className={styles.authLabel}>{t('composer.username')}</span>
                <InputBox
                  className={styles.authField}
                  ariaLabel={t('composer.username')}
                  value={auth.username}
                  onValueChange={(username) => setAuth({ username })}
                />
              </div>
              <div className={styles.authRow}>
                <span className={styles.authLabel}>{t('composer.password')}</span>
                <InputBox
                  className={styles.authField}
                  ariaLabel={t('composer.password')}
                  value={auth.password}
                  onValueChange={(password) => setAuth({ password })}
                />
              </div>
            </>
          ) : null}
          {auth.type === 'none' ? (
            <div className={styles.authNote}>{t('composer.noAuthorization')}</div>
          ) : (
            <div className={styles.authNote}>{t('composer.authorizationOnSend')}</div>
          )}
        </div>
      ) : null}
    </div>
  );
}
