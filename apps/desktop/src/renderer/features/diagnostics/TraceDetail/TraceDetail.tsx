import { SectionHeader, Timeline } from '../../../components';
import { TIMELINE } from '../data';
import styles from './TraceDetail.module.css';

/** Right diagnostics pane: identifiers and the action timeline. */
export function TraceDetail(): React.JSX.Element {
  return (
    <div className={styles.detail}>
      <div className={styles.top}>
        <span className={styles.command}>capture:query</span>
        <div className={styles.ids}>
          <span className={styles.idpill}>trace 6f2a…c19b</span>
          <span className={styles.idpill}>req 00A4</span>
          <span className={styles.idpill}>success · 5.0 ms</span>
        </div>
      </div>
      <div className={styles.scroll}>
        <SectionHeader>Action timeline</SectionHeader>
        <Timeline entries={TIMELINE} />
      </div>
    </div>
  );
}
