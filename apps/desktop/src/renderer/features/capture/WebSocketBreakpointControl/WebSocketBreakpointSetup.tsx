import { Pause, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type {
  WebSocketBreakpointDirection,
  WebSocketBreakpointFrame,
  WebSocketBreakpointSettings,
} from '../../../../shared/desktop-api';
import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
import { Button, InputBox, Segmented, Select } from '../../../components';
import {
  breakpointTimeoutFromSelection,
  type BreakpointTimeoutSelection,
} from '../../breakpoints/utils';
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
  const [timeoutSelection, setTimeoutSelection] = useState<BreakpointTimeoutSelection>('none');
  const [customTimeoutSeconds, setCustomTimeoutSeconds] = useState('');
  const timeout = breakpointTimeoutFromSelection(timeoutSelection, customTimeoutSeconds);
  const customTimeoutInvalid = timeoutSelection === 'custom' && timeout === null;
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

      <div className={styles.settingRow} data-parity="websocket-breakpoint-timeout-row">
        <span>{t('capture.wsBreakpointTimeout')}</span>
        <Select
          className={styles.timeoutSelect}
          contentClassName={styles.timeoutSelectContent}
          ariaLabel={t('capture.wsBreakpointTimeout')}
          options={[
            {
              value: 'none',
              label: t('capture.wsBreakpointTimeoutNone'),
              automationId: AUTOMATION_IDS.capture.websocket.breakpointTimeoutOption.none,
            },
            {
              value: '10',
              label: t('capture.wsBreakpointTimeout10'),
              automationId: AUTOMATION_IDS.capture.websocket.breakpointTimeoutOption.ten,
            },
            {
              value: '30',
              label: t('capture.wsBreakpointTimeout30'),
              automationId: AUTOMATION_IDS.capture.websocket.breakpointTimeoutOption.thirty,
            },
            {
              value: '60',
              label: t('capture.wsBreakpointTimeout60'),
              automationId: AUTOMATION_IDS.capture.websocket.breakpointTimeoutOption.sixty,
            },
            {
              value: 'custom',
              label: t('capture.wsBreakpointTimeoutCustom'),
              automationId: AUTOMATION_IDS.capture.websocket.breakpointTimeoutOption.custom,
            },
          ]}
          value={timeoutSelection}
          onValueChange={(value) => setTimeoutSelection(value as BreakpointTimeoutSelection)}
          automationId={AUTOMATION_IDS.capture.websocket.breakpointTimeout}
        />
      </div>

      {timeoutSelection === 'custom' ? (
        <div className={styles.settingRow} data-parity="websocket-breakpoint-custom-timeout-row">
          <span>{t('capture.wsBreakpointTimeoutSeconds')}</span>
          <div className={styles.timeoutField}>
            <InputBox
              ariaInvalid={customTimeoutInvalid}
              ariaLabel={t('capture.wsBreakpointTimeoutSeconds')}
              automationId={AUTOMATION_IDS.capture.websocket.breakpointCustomTimeout}
              className={styles.timeoutInput}
              parity="websocket-breakpoint-custom-timeout-input"
              step={1}
              type="number"
              value={customTimeoutSeconds}
              onValueChange={setCustomTimeoutSeconds}
            />
            {customTimeoutInvalid ? (
              <span
                className={styles.timeoutError}
                data-automation-id={AUTOMATION_IDS.capture.websocket.breakpointTimeoutError}
                data-parity="websocket-breakpoint-timeout-error"
                role="alert"
              >
                {t('capture.wsBreakpointTimeoutInvalid')}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

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
          disabled={frames.length === 0 || timeout === null}
          onClick={() => {
            if (timeout !== null) {
              onEnable({ exchangeId, direction, frames, timeout });
            }
          }}
          automationId={AUTOMATION_IDS.capture.websocket.breakpointEnable}
        >
          {t('capture.wsBreakpointConfirm')}
        </Button>
      </div>
    </div>
  );
}
