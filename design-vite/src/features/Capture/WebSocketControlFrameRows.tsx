import { ArrowRight, CircleX } from 'lucide-react';

import styles from './WebSocketControlFrameRows.module.css';

export function WebSocketControlFrameRows(): React.JSX.Element {
  return (
    <>
      <div className={styles.controlFrameRow}>
        <span className={styles.controlFrameDirection}>
          <ArrowRight aria-hidden="true" size={12} />
        </span>
        <span className={styles.controlFrameKind}>Ping</span>
        <span className={styles.controlFramePreview}>68 62</span>
        <span>2 B</span>
        <span>+3.0 s</span>
      </div>
      <div className={styles.controlFrameRow}>
        <span className={styles.controlFrameDirection} data-received>
          <ArrowRight aria-hidden="true" size={12} />
        </span>
        <span className={styles.controlFrameKind}>Pong</span>
        <span className={styles.controlFramePreview}>68 62</span>
        <span>2 B</span>
        <span>+3.0 s</span>
      </div>
      <div className={styles.controlFrameRow} data-close>
        <span className={styles.controlFrameDirection} data-received>
          <CircleX aria-hidden="true" size={12} />
        </span>
        <span className={styles.controlFrameKind}>Close</span>
        <span className={styles.controlFramePreview}>1000 · Normal Closure</span>
        <span>16 B</span>
        <span>+8.4 s</span>
      </div>
    </>
  );
}
