import { Button, Popover, Select } from 'antd';
import { Pause, X } from 'lucide-react';

import { ActionButton } from '../../components/ActionButton/ActionButton';
import { IconButton } from '../../components/IconButton/IconButton';
import { SegmentedControl } from '../../components/SegmentedControl/SegmentedControl';
import type {
  WebSocketBreakpointDirection,
  WebSocketBreakpointFrame,
  WebSocketBreakpointTimeout,
  WebSocketMessagePayload,
} from '../../state/types';
import { useDesignState } from '../../state/useDesignState';
import styles from './WebSocketBreakpointControl.module.css';

const DIRECTION_OPTIONS = [
  { value: 'both', label: 'Both' },
  { value: 'sent', label: 'Sent' },
  { value: 'received', label: 'Received' },
] as const;

const TIMEOUT_OPTIONS = [
  { value: 'none', label: 'No timeout' },
  { value: '10', label: '10 seconds' },
  { value: '30', label: '30 seconds' },
  { value: '60', label: '1 minute' },
];

const FRAME_OPTIONS = [
  { value: 'message', label: 'Messages' },
  { value: 'ping', label: 'Ping' },
  { value: 'pong', label: 'Pong' },
  { value: 'close', label: 'Close' },
] satisfies readonly {
  readonly value: WebSocketBreakpointFrame;
  readonly label: string;
}[];

const PAYLOAD_BY_FRAME: Readonly<Record<WebSocketBreakpointFrame, WebSocketMessagePayload>> = {
  message: 'text',
  ping: 'ping',
  pong: 'pong',
  close: 'close',
};

export function WebSocketBreakpointControl(): React.JSX.Element {
  const { state, updateState } = useDesignState();
  const setupOpen = state.websocketBreakpoint === 'setup';
  const enabled = state.websocketBreakpoint === 'enabled';
  const toggleFrame = (frame: WebSocketBreakpointFrame): void => {
    updateState({
      websocketBreakpointFrames: state.websocketBreakpointFrames.includes(frame)
        ? state.websocketBreakpointFrames.filter((candidate) => candidate !== frame)
        : [...state.websocketBreakpointFrames, frame],
    });
  };
  const enableBreakpoint = (): void => {
    const nextFrame = FRAME_OPTIONS.find((frame) =>
      state.websocketBreakpointFrames.includes(frame.value))?.value ?? 'message';
    updateState({ websocketBreakpoint: 'enabled' });
    window.setTimeout(() => updateState({
      breakpointBody: 'ready',
      breakpointState: 'websocket',
      websocketMessageDirection: state.websocketBreakpointDirection === 'received' ? 'received' : 'sent',
      websocketMessagePayload: PAYLOAD_BY_FRAME[nextFrame],
    }), 500);
  };

  const setup = (
    <div className={styles.breakpointSetup}>
      <div>
        <div className={styles.breakpointTitle}>Pause messages on this connection</div>
        <div className={styles.connectionAddress}>realtime.example.com/socket</div>
      </div>
      <div className={styles.settingRow}>
        <span>Direction</span>
        <SegmentedControl
          ariaLabel="Direction"
          value={state.websocketBreakpointDirection}
          options={DIRECTION_OPTIONS}
          onChange={(websocketBreakpointDirection: WebSocketBreakpointDirection) => updateState({
            websocketBreakpointDirection,
          })}
        />
      </div>
      <div className={styles.frameSettingRow}>
        <span>Frames</span>
        <div aria-label="Frames" className={styles.frameOptions} role="group">
          {FRAME_OPTIONS.map((frame) => {
            const selected = state.websocketBreakpointFrames.includes(frame.value);
            return (
              <Button
                aria-pressed={selected}
                className={styles.frameOption}
                color={selected ? 'primary' : 'default'}
                key={frame.value}
                variant={selected ? 'filled' : 'text'}
                onClick={() => toggleFrame(frame.value)}
              >
                {frame.label}
              </Button>
            );
          })}
        </div>
      </div>
      <div className={styles.settingRow}>
        <label htmlFor="websocket-breakpoint-timeout">Timeout</label>
        <Select
          id="websocket-breakpoint-timeout"
          value={state.websocketBreakpointTimeout}
          options={TIMEOUT_OPTIONS}
          onChange={(timeout) => updateState({
            websocketBreakpointTimeout: timeout as WebSocketBreakpointTimeout,
          })}
        />
      </div>
      <div className={styles.setupActions}>
        <span className={styles.actionSpacer} />
        <ActionButton
          icon={<X aria-hidden="true" />}
          label="Cancel"
          onClick={() => updateState({ websocketBreakpoint: 'disabled' })}
        />
        <ActionButton
          disabled={state.websocketBreakpointFrames.length === 0}
          icon={<Pause aria-hidden="true" />}
          label="Enable breakpoint"
          tone="primary"
          onClick={enableBreakpoint}
        />
      </div>
    </div>
  );

  if (enabled) {
    return (
      <IconButton
        label="Disable message breakpoint"
        icon={<Pause aria-hidden="true" />}
        pressed
        tone="warning"
        onClick={() => updateState({ websocketBreakpoint: 'disabled' })}
      />
    );
  }

  return (
    <Popover
      arrow={false}
      autoAdjustOverflow
      content={setup}
      open={setupOpen}
      placement="bottomRight"
      trigger="click"
      onOpenChange={(open) => updateState({
        websocketBreakpoint: open ? 'setup' : 'disabled',
      })}
      classNames={{ container: styles.webSocketBreakpointPopover }}
    >
      <span>
        <IconButton
          label="Enable message breakpoint"
          icon={<Pause aria-hidden="true" />}
          onClick={() => updateState({ websocketBreakpoint: 'setup' })}
        />
      </span>
    </Popover>
  );
}
