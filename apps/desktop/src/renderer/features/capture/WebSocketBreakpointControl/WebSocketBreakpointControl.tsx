import { theme } from 'antd';
import { Pause } from 'lucide-react';
import { useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';

import type { WebSocketBreakpointSettings } from '../../../../shared/desktop-api';
import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
import { cx, Flyout, IconButton } from '../../../components';
import { WebSocketBreakpointSetup } from './WebSocketBreakpointSetup';
import styles from './WebSocketBreakpointControl.module.css';

export interface WebSocketBreakpointControlProps {
  /** 断点只作用于这条连接。 */
  exchangeId: string;
  /** Connection address shown in the setup panel. */
  connection: string;
  /** Current settings; null while breakpoints are off. */
  breakpoint: WebSocketBreakpointSettings | null;
  onEnable: (settings: WebSocketBreakpointSettings) => void;
  onDisable: () => void;
}

/**
 * Message breakpoint switch for the connection currently open in the inspector.
 * Enabling always goes through the setup panel, so direction and frames are never
 * left implicit; disabling is a single click on the armed button.
 */
export function WebSocketBreakpointControl({
  exchangeId,
  connection,
  breakpoint,
  onEnable,
  onDisable,
}: WebSocketBreakpointControlProps): React.JSX.Element {
  const { t } = useTranslation();
  const { token } = theme.useToken();
  const [setupOpen, setSetupOpen] = useState(false);
  const hoverStyle = {
    '--icon-button-hover-background': token.colorFillTertiary,
  } as CSSProperties;

  if (breakpoint) {
    return (
      <IconButton
        icon={Pause}
        size="sm"
        label={t('capture.wsBreakpointDisable')}
        className={cx(styles.control, styles.armed)}
        onClick={onDisable}
        automationId={AUTOMATION_IDS.capture.websocket.breakpointToggle}
      />
    );
  }

  return (
    <Flyout
      open={setupOpen}
      onOpenChange={setSetupOpen}
      className={styles.setupPanel}
      padding={11}
      content={(
        <WebSocketBreakpointSetup
          exchangeId={exchangeId}
          connection={connection}
          onCancel={() => setSetupOpen(false)}
          onEnable={(settings) => {
            setSetupOpen(false);
            onEnable(settings);
          }}
        />
      )}
    >
      <span style={hoverStyle}>
        <IconButton
          icon={Pause}
          size="sm"
          label={t('capture.wsBreakpointEnable')}
          tooltip={null}
          className={styles.control}
          automationId={AUTOMATION_IDS.capture.websocket.breakpointToggle}
        />
      </span>
    </Flyout>
  );
}
