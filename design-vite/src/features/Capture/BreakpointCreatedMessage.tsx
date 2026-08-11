import { App, Button } from 'antd';
import { X } from 'lucide-react';
import { useEffect } from 'react';

import { useDesignState } from '../../state/useDesignState';
import styles from './BreakpointCreatedMessage.module.css';

const MESSAGE_KEY = 'breakpoint-created';

export function BreakpointCreatedMessage(): null {
  const { message } = App.useApp();
  const { state, updateState } = useDesignState();

  useEffect(() => {
    if (state.breakpointMessage !== 'created') {
      message.destroy(MESSAGE_KEY);
      return;
    }

    void message.success({
      key: MESSAGE_KEY,
      content: (
        <span className={styles.breakpointMessageContent}>
          <span>Breakpoint created</span>
          <Button
            size="small"
            type="primary"
            onClick={() => updateState({ breakpointMessage: '' })}
          >
            Undo
          </Button>
          <Button
            aria-label="Dismiss"
            icon={<X aria-hidden="true" size={14} />}
            size="small"
            title="Dismiss"
            type="text"
            onClick={() => updateState({ breakpointMessage: '' })}
          />
        </span>
      ),
      duration: 5,
      onClose: () => updateState({ breakpointMessage: '' }),
      pauseOnHover: true,
    });

    return () => message.destroy(MESSAGE_KEY);
  }, [message, state.breakpointMessage, updateState]);

  return null;
}