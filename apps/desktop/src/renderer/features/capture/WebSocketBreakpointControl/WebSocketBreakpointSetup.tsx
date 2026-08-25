import { Pause, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type {
  WebSocketBreakpointDirection,
  WebSocketBreakpointFrame,
  WebSocketBreakpointSettings,
} from '../../../../shared/desktop-api';
import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
import { Button, Segmented } from '../../../components';
import { FrameToggle } from './FrameToggle';
import styles from './WebSocketBreakpointSetup.module.css';

const FRAME_ORDER: readonly WebSocketBreakpointFrame[] = ['message', 'ping', 'pong', 'close'];

export interface WebSocketBreakpointSetupProps {
  /** 断点只作用于这条连接。 */
  exchangeId: string;
  /** Connection address shown under the title so the scope is unambiguous. */
  connection: string;
  onCancel: () => void;
  onEnable: (settings: WebSocketBreakpointSettings) => void;
}

/** Configure-and-enable panel for the current connection's message breakpoint. */
export function WebSocketBreakpointSetup({
  exchangeId,
  connection,
  onCancel,
  onEnable,
}: WebSocketBreakpointSetupProps): React.JSX.Element {
  const { t } = useTranslation();
  const [direction, setDirection] = useState<WebSocketBreakpointDirection>('both');
  const [frames, setFrames] = useState<WebSocketBreakpointFrame[]>(['message']);
  const frameLabels: Readonly<Record<WebSocketBreakpointFrame, string>> = {
    message: t('capture.wsBreakpointFrameMessage'),
    ping: t('capture.wsBreakpointFramePing'),
    pong: t('capture.wsBreakpointFramePong'),
    close: t('capture.wsBreakpointFrameClose'),
  };

  const toggleFrame = (frame: WebSocketBreakpointFrame): void => {
    setFrames((current) => (current.includes(frame)
      ? current.filter((candidate) => candidate !== frame)
      : FRAME_ORDER.filter((candidate) => candidate === frame || current.includes(candidate))));
  };

  return (
    <div className={styles.setup} data-parity="websocket-breakpoint-setup">
      <div>
        <div className={styles.title}>{t('capture.wsBreakpointTitle')}</div>
        <div className={styles.connection}>{connection}</div>
      </div>

      <div className={styles.settingRow} data-parity="websocket-breakpoint-direction-row">
        <span>{t('capture.wsBreakpointDirection')}</span>
        <Segmented
          ariaLabel={t('capture.wsBreakpointDirection')}
          options={[
            { value: 'both', label: t('capture.wsBreakpointDirectionBoth') },
            { value: 'client-to-server', label: t('capture.wsBreakpointDirectionSent') },
            { value: 'server-to-client', label: t('capture.wsBreakpointDirectionReceived') },
          ]}
          value={direction}
          onChange={(value) => setDirection(value as WebSocketBreakpointDirection)}
        />
      </div>

      <div className={styles.frameRow} data-parity="websocket-breakpoint-frames-row">
        <span>{t('capture.wsBreakpointFrames')}</span>
        <div className={styles.frameOptions} role="group" aria-label={t('capture.wsBreakpointFrames')}>
          {FRAME_ORDER.map((frame) => (
            <FrameToggle
              key={frame}
              label={frameLabels[frame]}
              automationId={AUTOMATION_IDS.capture.websocket.breakpointFrame[frame]}
              selected={frames.includes(frame)}
              onToggle={() => toggleFrame(frame)}
            />
          ))}
        </div>
      </div>

      <div className={styles.actions} data-parity="websocket-breakpoint-actions-row">
        <span className={styles.spacer} />
        <Button
          icon={X}
          className={styles.actionButton}
          onClick={onCancel}
          automationId={AUTOMATION_IDS.capture.websocket.breakpointCancel}
        >
          {t('capture.wsBreakpointCancel')}
        </Button>
        <Button
          icon={Pause}
          className={styles.actionButton}
          variant="primary"
          disabled={frames.length === 0}
          onClick={() => onEnable({ exchangeId, direction, frames })}
          automationId={AUTOMATION_IDS.capture.websocket.breakpointEnable}
        >
          {t('capture.wsBreakpointConfirm')}
        </Button>
      </div>
    </div>
  );
}
