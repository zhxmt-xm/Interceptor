import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type {
  WebSocketBreakpointDirection,
  WebSocketBreakpointFrame,
  WebSocketBreakpointSettings,
} from '../../../../shared/desktop-api';
import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
import { Button, Segmented, Select } from '../../../components';
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
  const [timeoutMs, setTimeoutMs] = useState(0);
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
    <div className={styles.setup}>
      <div>
        <div className={styles.title}>{t('capture.wsBreakpointTitle')}</div>
        <div className={styles.connection}>{connection}</div>
      </div>

      <div className={styles.settingRow}>
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

      <div className={styles.frameRow}>
        <span>{t('capture.wsBreakpointFrames')}</span>
        <div className={styles.frameOptions} role="group" aria-label={t('capture.wsBreakpointFrames')}>
          {FRAME_ORDER.map((frame) => (
            <FrameToggle
              key={frame}
              label={frameLabels[frame]}
              selected={frames.includes(frame)}
              onToggle={() => toggleFrame(frame)}
            />
          ))}
        </div>
      </div>

      <div className={styles.settingRow}>
        <span>{t('capture.wsBreakpointTimeout')}</span>
        <Select
          ariaLabel={t('capture.wsBreakpointTimeout')}
          options={[
            { value: '0', label: t('capture.wsBreakpointTimeoutNone') },
            { value: '10000', label: t('capture.wsBreakpointTimeout10') },
            { value: '30000', label: t('capture.wsBreakpointTimeout30') },
            { value: '60000', label: t('capture.wsBreakpointTimeout60') },
          ]}
          value={String(timeoutMs)}
          onValueChange={(value) => setTimeoutMs(Number(value))}
          automationId={AUTOMATION_IDS.capture.websocket.breakpointTimeout}
        />
      </div>

      <div className={styles.actions}>
        <span className={styles.spacer} />
        <Button
          onClick={onCancel}
          automationId={AUTOMATION_IDS.capture.websocket.breakpointCancel}
        >
          {t('capture.wsBreakpointCancel')}
        </Button>
        <Button
          variant="primary"
          disabled={frames.length === 0}
          onClick={() => onEnable({ exchangeId, direction, frames, timeoutMs })}
          automationId={AUTOMATION_IDS.capture.websocket.breakpointEnable}
        >
          {t('capture.wsBreakpointConfirm')}
        </Button>
      </div>
    </div>
  );
}
