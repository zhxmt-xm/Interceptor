import { useDesignState } from '../../state/useDesignState';
import styles from './WebSocketMessageState.module.css';

export function WebSocketMessageState(): React.JSX.Element | null {
  const { state } = useDesignState();
  if (state.websocketMessagesState === 'ready') return null;
  const message = state.websocketMessagesState === 'loading'
    ? 'Loading messages\u2026'
    : state.websocketMessagesState === 'error'
      ? 'Failed to load messages: Connection unavailable'
      : 'No WebSocket messages captured.';
  return (
    <div className={styles.websocketMessageState} data-parity="websocket-message-state">
      {message}
    </div>
  );
}