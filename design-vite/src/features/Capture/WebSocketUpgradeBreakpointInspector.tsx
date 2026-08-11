import { Button, Input, Select } from 'antd';
import { X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { ActionFooter } from '../../components/ActionFooter/ActionFooter';
import { CollapsibleSection } from '../../components/CollapsibleSection/CollapsibleSection';
import { HeaderFieldsEditor, type HeaderField } from '../../components/HeaderFieldsEditor/HeaderFieldsEditor';
import { PauseBanner } from '../../components/PauseBanner/PauseBanner';
import { useDesignState } from '../../state/useDesignState';
import styles from './WebSocketUpgradeBreakpointInspector.module.css';

const REQUEST_HEADERS: readonly HeaderField[] = [
  { id: 'host', name: 'Host', value: 'realtime.example.com' },
  { id: 'upgrade', name: 'Upgrade', value: 'websocket' },
  { id: 'connection', name: 'Connection', value: 'Upgrade' },
  { id: 'key', name: 'Sec-WebSocket-Key', value: 'dGhlIHNhbXBsZSBub25jZQ==' },
  { id: 'version', name: 'Sec-WebSocket-Version', value: '13' },
  { id: 'origin', name: 'Origin', value: 'https://app.example.com' },
  { id: 'protocol', name: 'Sec-WebSocket-Protocol', value: 'graphql-transport-ws' },
];

const RESPONSE_HEADERS: readonly HeaderField[] = [
  { id: 'upgrade', name: 'Upgrade', value: 'websocket' },
  { id: 'connection', name: 'Connection', value: 'Upgrade' },
  { id: 'accept', name: 'Sec-WebSocket-Accept', value: 's3pPLMBiTxaQ9kYGzzhZRbK+xOo=' },
  { id: 'protocol', name: 'Sec-WebSocket-Protocol', value: 'graphql-transport-ws' },
];

const MOCK_ERROR_HEADERS: readonly HeaderField[] = [
  { id: 'content-type', name: 'Content-Type', value: 'application/json' },
  { id: 'retry-after', name: 'Retry-After', value: '30' },
  { id: 'x-reason', name: 'X-Mock-Reason', value: 'maintenance' },
];

export function WebSocketUpgradeBreakpointInspector(): React.JSX.Element {
  const { state, updateState } = useDesignState();
  const response = state.breakpointState === 'websocket-upgrade-response';
  const mockError = response && state.websocketUpgradeResponse === 'mock-error';
  const [method, setMethod] = useState('GET');
  const [url, setUrl] = useState('wss://realtime.example.com/socket?transport=websocket');
  const [status, setStatus] = useState(mockError ? '503' : '101');
  const [statusText, setStatusText] = useState(mockError ? 'Service Unavailable' : 'Switching Protocols');
  const [targetOpen, setTargetOpen] = useState(true);
  const headerVariant = response ? (mockError ? 'mock-error' : 'response') : 'request';
  const headerFields = headerVariant === 'mock-error'
    ? MOCK_ERROR_HEADERS
    : headerVariant === 'response' ? RESPONSE_HEADERS : REQUEST_HEADERS;

  useEffect(() => {
    setStatus(mockError ? '503' : '101');
    setStatusText(mockError ? 'Service Unavailable' : 'Switching Protocols');
  }, [mockError]);

  const close = (): void => updateState({
    breakpointState: '',
    scene: 'websocket',
    tab: 'headers',
    detail: 'open',
  });

  return (
    <section className={styles.websocketUpgradeBreakpointInspector}>
      <header className={styles.webSocketUpgradeHeader}>
        <span className={styles.webSocketUpgradeMethod}>{response ? status : method}</span>
        <span className={styles.webSocketUpgradeUrl}>realtime.example.com/socket</span>
        <Button
          aria-label="Close"
          icon={<X aria-hidden="true" size={14} />}
          size="small"
          type="text"
          onClick={close}
        />
      </header>

      <PauseBanner
        phase={response ? 'Upgrade response paused' : 'Upgrade request paused'}
        received={response}
        rule="HTTP breakpoint · WebSocket Upgrade"
      />

      <div className={styles.webSocketUpgradeContent}>
        {response ? (
          <CollapsibleSection open={targetOpen} title="Response status" onOpenChange={setTargetOpen}>
            <div className={styles.webSocketUpgradeStatusFields}>
              <Input
                aria-label="Status code"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              />
              <Input
                aria-label="Status text"
                value={statusText}
                onChange={(event) => setStatusText(event.target.value)}
              />
            </div>
          </CollapsibleSection>
        ) : (
          <CollapsibleSection open={targetOpen} title="Request target" onOpenChange={setTargetOpen}>
            <div className={styles.webSocketUpgradeTargetFields}>
              <Select
                aria-label="Request method"
                value={method}
                options={['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((value) => ({ value, label: value }))}
                onChange={setMethod}
              />
              <Input
                aria-label="Request URL"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
              />
            </div>
          </CollapsibleSection>
        )}

        <HeaderFieldsEditor
          initialFields={headerFields}
          key={headerVariant}
          title={response ? 'Response headers' : 'Request headers'}
        />
      </div>

      <ActionFooter
        forwardLabel="Forward edited"
        onContinue={close}
        onDrop={close}
        onForward={close}
      />
    </section>
  );
}
