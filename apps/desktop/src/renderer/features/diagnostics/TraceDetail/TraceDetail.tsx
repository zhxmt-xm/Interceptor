import { SectionHeader, Timeline } from '../../../components';
import { buildTimeline, selectTraceRecords } from '../data';
import { useDiagnostics } from '../DiagnosticsProvider';
import styles from './TraceDetail.module.css';

/** Right diagnostics pane: identifiers and the action timeline. */
export function TraceDetail(): React.JSX.Element {
  const { records, selectedKey } = useDiagnostics();
  const traceRecords = selectTraceRecords(records, selectedKey);
  const sorted = [...traceRecords].sort((a, b) => a.sequence - b.sequence);
  const [first] = sorted;

  if (!first) {
    return (
      <div className={styles.detail}>
        <div className={styles.scroll}>
          <SectionHeader>Action timeline</SectionHeader>
          <div className={styles.empty}>
            Select a command to inspect its trace.
          </div>
        </div>
      </div>
    );
  }

  const completed =
    sorted.find((record) => record.phase === 'command.completed') ??
    sorted[sorted.length - 1] ??
    first;
  const command =
    sorted.find((record) => record.command)?.command ?? first.phase;
  const outcomeLabel =
    completed.outcome ?? (completed.level === 'error' ? 'failed' : 'ok');
  const duration =
    completed.durationMs != null ? ` · ${completed.durationMs} ms` : '';

  return (
    <div className={styles.detail}>
      <div className={styles.top}>
        <span className={styles.command}>{command}</span>
        <div className={styles.ids}>
          {first.traceId ? (
            <span className={styles.idpill}>trace {shortenId(first.traceId)}</span>
          ) : null}
          {first.requestId ? (
            <span className={styles.idpill}>req {shortenId(first.requestId)}</span>
          ) : null}
          <span className={styles.idpill}>
            {outcomeLabel}
            {duration}
          </span>
          {completed.errorCode ? (
            <span className={styles.idpill}>{completed.errorCode}</span>
          ) : null}
        </div>
      </div>
      <div className={styles.scroll}>
        <SectionHeader>Action timeline</SectionHeader>
        <Timeline entries={buildTimeline(sorted)} />
      </div>
    </div>
  );
}

function shortenId(id: string): string {
  return id.length <= 10 ? id : `${id.slice(0, 4)}…${id.slice(-4)}`;
}
