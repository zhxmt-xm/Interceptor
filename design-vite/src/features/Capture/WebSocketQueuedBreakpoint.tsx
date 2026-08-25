import { ListOrdered } from 'lucide-react';

import styles from './WebSocketQueuedBreakpoint.module.css';

export function WebSocketQueuedBreakpoint(): React.JSX.Element {
  return (
    <div className={styles.queued} data-parity="websocket-breakpoint-queued">
      <span className={styles.state}>
        <ListOrdered aria-hidden="true" />
        Queued
      </span>
      <span className={styles.position}>2 of 2</span>
      <span className={styles.queue}>in WebSocket queue</span>
    </div>
  );
}
