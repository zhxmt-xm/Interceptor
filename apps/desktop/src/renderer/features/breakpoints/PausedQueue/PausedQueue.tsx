import { ArrowRight, Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button, Count, cx, type HttpMethod, MethodBadge, Switch } from '../../../components';
import { useBreakpointsStore } from '../data/breakpointsStore';
import { continueAllBreakpoints, setBreakOnMatch } from '../data/useBreakpoints';
import { formatCountdown } from '../utils';
import styles from './PausedQueue.module.css';

/** Left breakpoints pane: the queue of paused requests/responses. */
export function PausedQueue(): React.JSX.Element {
  const { i18n, t } = useTranslation();
  const breakpoints = useBreakpointsStore((state) => state.breakpoints);
  const enabled = useBreakpointsStore((state) => state.enabled);
  const selectedId = useBreakpointsStore((state) => state.selectedId);
  const select = useBreakpointsStore((state) => state.select);

  return (
    <div className={styles.queue}>
      <div className={styles.bar}>
        <Count>{t('breakpoints.pausedCount', { count: breakpoints.length })}</Count>
        <span className={styles.breakLabel}>{t('breakpoints.breakOnMatch')}</span>
        <Switch checked={enabled} onChange={(next) => void setBreakOnMatch(next)} />
        <Button
          size="sm"
          disabled={breakpoints.length === 0}
          onClick={() => void continueAllBreakpoints()}
        >
          {t('breakpoints.continueAll')}
        </Button>
      </div>

      {breakpoints.length === 0 ? (
        <div className={styles.empty}>
          {t('breakpoints.empty')}
        </div>
      ) : (
        breakpoints.map((breakpoint) => {
          const isResponse = breakpoint.phase === 'response';
          const isWebSocket = breakpoint.phase === 'websocket';
          const outgoing = breakpoint.direction === 'client-to-server';
          return (
            <button
              type="button"
              key={breakpoint.id}
              className={cx(styles.row, breakpoint.id === selectedId && styles.selected)}
              onClick={() => select(breakpoint.id)}
            >
              <span
                className={cx(
                  styles.dir,
                  isWebSocket ? (outgoing ? styles.wsOut : styles.wsIn) : isResponse ? styles.resp : styles.req,
                )}
              >
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
                  {isWebSocket ? (
                    <span className={styles.messageType}>
                      {outgoing ? t('capture.sent') : t('capture.received')} · {breakpoint.opcode === 2 ? t('capture.binary') : t('capture.text')}
                    </span>
                  ) : null}
                  <span className={styles.name}>{breakpoint.ruleName || t('breakpoints.defaultName')}</span>
                </div>
                <div className={styles.url}>{breakpoint.url ?? ''}</div>
              </div>
              <span className={cx(styles.countdown, (isResponse || isWebSocket) && styles.countdownMuted)}>
                <Clock size={13} strokeWidth={1.9} />
                {formatCountdown(breakpoint.deadline, i18n.language)}
              </span>
            </button>
          );
        })
      )}
    </div>
  );
}
