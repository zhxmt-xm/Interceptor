import { ArrowRight, CircleX } from 'lucide-react';
import { useLayoutEffect } from 'react';

import { useDesignState } from '../../state/useDesignState';
import styles from './WebSocketControlFrameRows.module.css';

export function WebSocketControlFrameRows(): React.JSX.Element {
  const { state, updateState } = useDesignState();
  const queueVisible = state.breakpointState === 'websocket'
    && state.breakpointQueueSelection.startsWith('websocket-');

  useLayoutEffect(() => {
    if (!queueVisible) return;
    const head = document.querySelector<HTMLElement>('.wsrows > .wsrow.sel');
    if (!head) return;
    head.dataset.breakpointId = 'bp-ws-head';
    head.dataset.queueKey = 'ws:ws-fixture';
    head.dataset.queuePosition = '1';
    head.dataset.breakpointState = 'head';
    const selectHead = (): void => updateState({ breakpointQueueSelection: 'websocket-head' });
    head.addEventListener('click', selectHead);
    return () => {
      delete head.dataset.breakpointId;
      delete head.dataset.queueKey;
      delete head.dataset.queuePosition;
      delete head.dataset.breakpointState;
      head.removeEventListener('click', selectHead);
    };
  }, [queueVisible, updateState]);

  return (
    <>
      {queueVisible ? (
        <button
          type="button"
          className={styles.queuedFrameRow}
          data-breakpoint-id="bp-ws-queued"
          data-queue-key="ws:ws-fixture"
          data-queue-position="2"
          data-breakpoint-state="queued"
          onClick={() => updateState({ breakpointQueueSelection: 'websocket-queued' })}
        >
          <span className={styles.controlFrameDirection} data-received>
            <ArrowRight aria-hidden="true" size={12} />
          </span>
          <span className={styles.controlFrameKind}>Text</span>
          <span className={styles.controlFramePreview}>
            {'{"type":"presence","status":"away","userId":"u_1842"}'}
          </span>
          <span>58 B</span>
          <span>queued</span>
        </button>
      ) : null}
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
