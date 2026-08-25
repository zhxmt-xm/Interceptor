import { Input } from 'antd';
import { useState } from 'react';

import { ActionFooter } from '../../components/ActionFooter/ActionFooter';
import { CollapsibleSection } from '../../components/CollapsibleSection/CollapsibleSection';
import { PauseBanner } from '../../components/PauseBanner/PauseBanner';
import {
  PayloadEditor,
  type ReplacementMode,
} from '../../components/PayloadEditor/PayloadEditor';
import { useDesignState } from '../../state/useDesignState';
import { BreakpointQueueMenu } from './BreakpointQueueMenu';
import styles from './WebSocketBreakpointInspector.module.css';

export function WebSocketBreakpointInspector(): React.JSX.Element {
  const { state, updateState } = useDesignState();
  const [closeCodeOpen, setCloseCodeOpen] = useState(true);
  const [closeCode, setCloseCode] = useState('1000');
  const payloadKind = state.websocketMessagePayload;
  const binary = payloadKind === 'binary';
  const controlFrame = payloadKind === 'ping' || payloadKind === 'pong' || payloadKind === 'close';
  const sent = state.websocketMessageDirection === 'sent';
  const replacement: ReplacementMode = state.breakpointBody === 'replace'
    ? 'text'
    : 'off';
  const ruleDirection = state.websocketBreakpointDirection === 'both'
    ? 'Both directions'
    : state.websocketBreakpointDirection === 'sent'
      ? 'Sent only'
      : 'Received only';
  const kindLabel = {
    text: 'Text',
    binary: 'Binary',
    ping: 'Ping',
    pong: 'Pong',
    close: 'Close',
  }[payloadKind];
  const directionLabel = `${sent ? 'Sent' : 'Received'} ${controlFrame ? kindLabel.toLowerCase() : 'message'} paused`;
  const originalPayload = payloadKind === 'text'
    ? '{\n  "type": "presence",\n  "status": "online",\n  "userId": "u_1842"\n}'
    : payloadKind === 'binary'
      ? '7b 22 74 79 70 65 22 3a 22 70 72 65 73 65 6e 63 65 22 2c 22 73 74 61 74 75 73 22 3a 22 6f 6e 6c 69 6e 65 22 7d'
      : payloadKind === 'close'
        ? 'Normal Closure'
        : '68 62';
  const payloadMeta = payloadKind === 'text'
    ? 'text · 60 B'
    : payloadKind === 'binary'
      ? 'binary · 47 B'
      : payloadKind === 'close'
        ? 'close · 16 B'
        : `${payloadKind} · 2 B`;

  const close = (): void => updateState({
    breakpointState: '',
    scene: 'websocket',
    tab: 'messages',
    detail: 'open',
  });

  return (
    <section className={styles.websocketBreakpointInspector}>
      <PauseBanner
        actions={state.breakpointQueueSelection === 'websocket-head'
          ? <BreakpointQueueMenu includeRule={false} />
          : undefined}
        phase={directionLabel}
        received={!sent}
        rule={ruleDirection}
      />

      <div className={styles.websocketPayloadEditor}>
        {payloadKind === 'close' ? (
          <CollapsibleSection
            open={closeCodeOpen}
            title="Close code"
            onOpenChange={setCloseCodeOpen}
          >
            <Input
              aria-label="Close code"
              className={styles.websocketCloseCode}
              inputMode="numeric"
              value={closeCode}
              onChange={(event) => setCloseCode(event.target.value)}
            />
          </CollapsibleSection>
        ) : null}
        <PayloadEditor
          originalFormat={binary || controlFrame ? 'raw bytes' : 'application/json'}
          originalMeta={payloadMeta}
          originalPayload={originalPayload}
          originalTitle="Original message"
          originalViewOptions={binary || controlFrame ? ['Hex', 'Text'] : ['Pretty', 'Raw', 'Hex']}
          replacementMode={replacement}
          replacementOptions={[
            { value: 'off', label: 'Off' },
            { value: 'text', label: 'Text' },
          ]}
          replacementPayload={payloadKind === 'close'
            ? 'Going Away'
            : controlFrame
              ? '70 72 6f 62 65'
              : binary
                ? '7b 22 74 79 70 65 22 3a 22 70 72 65 73 65 6e 63 65 22 2c 22 73 74 61 74 75 73 22 3a 22 61 77 61 79 22 7d'
                : '{\n  "type": "presence",\n  "status": "away",\n  "userId": "u_1842"\n}'}
          replacementTitle="Replacement message"
          onReplacementModeChange={(mode) => updateState({
            breakpointBody: mode === 'text' ? 'replace' : 'ready',
          })}
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
