import { ArrowRight, Clock } from 'lucide-react';
import { useState } from 'react';

import { Button, Count, cx, MethodBadge } from '../../../components';
import { PAUSED } from '../data';
import styles from './PausedQueue.module.css';

/** Left breakpoints pane: the queue of paused requests/responses. */
export function PausedQueue(): React.JSX.Element {
  const [selected, setSelected] = useState(0);

  return (
    <div className={styles.queue}>
      <div className={styles.bar}>
        <Count className={styles.grow}>
          <b>2</b> requests paused
        </Count>
        <Button size="sm">Continue all</Button>
      </div>

      {PAUSED.map((request, index) => (
        <button
          type="button"
          key={index}
          className={cx(styles.row, index === selected && styles.selected)}
          onClick={() => setSelected(index)}
        >
          <span className={cx(styles.dir, styles[request.dir])}>
            <ArrowRight size={16} strokeWidth={1.9} />
          </span>
          <div className={styles.meta}>
            <div className={styles.r1}>
              {request.method ? <MethodBadge method={request.method} /> : null}
              {request.status ? (
                <span className={styles.status}>
                  <span className={styles.dot} />
                  {request.status}
                </span>
              ) : null}
              <span className={styles.name}>{request.name}</span>
            </div>
            <div className={styles.url}>{request.url}</div>
          </div>
          <span className={cx(styles.countdown, request.dir === 'resp' && styles.countdownMuted)}>
            <Clock size={13} strokeWidth={1.9} />
            {request.time}
          </span>
        </button>
      ))}
    </div>
  );
}
