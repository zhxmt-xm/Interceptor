import { ArrowRight, Clock } from 'lucide-react';

import { Button, Count, cx, type HttpMethod, MethodBadge } from '../../../components';
import { formatCountdown, useBreakpointsStore } from '../breakpointsStore';
import { continueAllBreakpoints } from '../useBreakpoints';
import styles from './PausedQueue.module.css';

/** Left breakpoints pane: the queue of paused requests/responses. */
export function PausedQueue(): React.JSX.Element {
  const breakpoints = useBreakpointsStore((state) => state.breakpoints);
  const selectedId = useBreakpointsStore((state) => state.selectedId);
  const select = useBreakpointsStore((state) => state.select);

  return (
    <div className={styles.queue}>
      <div className={styles.bar}>
        <Count className={styles.grow}>
          <b>{breakpoints.length}</b> request{breakpoints.length === 1 ? '' : 's'} paused
        </Count>
        <Button
          size="sm"
          disabled={breakpoints.length === 0}
          onClick={() => void continueAllBreakpoints()}
        >
          Continue all
        </Button>
      </div>

      {breakpoints.length === 0 ? (
        <div className={styles.empty}>
          No paused requests. Add a rule with a breakpoint action and keep Break on match on.
        </div>
      ) : (
        breakpoints.map((breakpoint) => {
          const isResponse = breakpoint.phase === 'response';
          return (
            <button
              type="button"
              key={breakpoint.id}
              className={cx(styles.row, breakpoint.id === selectedId && styles.selected)}
              onClick={() => select(breakpoint.id)}
            >
              <span className={cx(styles.dir, isResponse ? styles.resp : styles.req)}>
                <ArrowRight size={16} strokeWidth={1.9} />
              </span>
              <div className={styles.meta}>
                <div className={styles.r1}>
                  {!isResponse && breakpoint.method ? (
                    <MethodBadge method={breakpoint.method.toLowerCase() as HttpMethod} />
                  ) : null}
                  {isResponse ? (
                    <span className={styles.status}>
                      <span className={styles.dot} />
                      {breakpoint.statusCode ?? '—'}
                    </span>
                  ) : null}
                  <span className={styles.name}>{breakpoint.ruleName || 'Breakpoint'}</span>
                </div>
                <div className={styles.url}>{breakpoint.url ?? ''}</div>
              </div>
              <span className={cx(styles.countdown, isResponse && styles.countdownMuted)}>
                <Clock size={13} strokeWidth={1.9} />
                {formatCountdown(breakpoint.deadline)}
              </span>
            </button>
          );
        })
      )}
    </div>
  );
}
