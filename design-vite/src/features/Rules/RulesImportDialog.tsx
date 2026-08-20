import { TriangleAlert, Upload, X } from 'lucide-react';

import { IconButton } from '../../components/IconButton/IconButton';
import { fixtureClassNames } from '../../fixtures/FixtureRenderer';
import { useDesignState } from '../../state/useDesignState';
import styles from './RulesImportDialog.module.css';

const SKIPPED_ITEMS = [
  { path: 'Ads / Block trackers', reason: 'Unsupported action type.' },
  { path: 'Ads / Rewrite UA', reason: 'Conditions must be a list.' },
  { path: 'Staging / Mock login', reason: 'The rule has empty required fields.' },
];

export function RulesImportDialog(): React.JSX.Element | null {
  const { state, updateState } = useDesignState();
  if (state.overlay !== 'rules-import') {
    return null;
  }

  const close = (): void => updateState({ overlay: '' });
  return (
    <div
      className={styles.importOverlay}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <section aria-labelledby="import-rules-title" className={styles.importDialog}>
        <header className={styles.importHeader}>
          <span className={styles.importIcon}><Upload aria-hidden="true" /></span>
          <h2 id="import-rules-title">Import rules?</h2>
          <IconButton label="Close" icon={<X aria-hidden="true" />} onClick={close} />
        </header>
        <div className={styles.importContent}>
          <p>
            Append <b>6 rules</b> in <b>2 folders</b> to the end of your rule set.
            Nothing existing is replaced or merged.
          </p>
          <div className={styles.importFile}>
            <span className={styles.importFileName}>interceptor-rules-2026-08-20.json</span>
          </div>
          <div className={styles.importSummary}>
            <div className={styles.importStat}>
              <span>Rules</span>
              <strong>6</strong>
            </div>
            <div className={styles.importStat}>
              <span>Folders</span>
              <strong>2</strong>
            </div>
            <div className={styles.importStat} data-emphasis="enabled">
              <span>Enabled</span>
              <strong>3</strong>
            </div>
            <div className={styles.importStat} data-emphasis="skipped">
              <span>Skipped</span>
              <strong>3</strong>
            </div>
          </div>
          <div className={styles.importSkipped}>
            <div className={styles.importSkippedHead}>
              <TriangleAlert aria-hidden="true" />
              <span>3 items cannot be imported and will be left out</span>
            </div>
            <ul className={styles.importSkippedList}>
              {SKIPPED_ITEMS.map((item) => (
                <li key={item.path}>
                  <span className={styles.importSkippedPath}>{item.path}</span>
                  <span className={styles.importSkippedReason}>{item.reason}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className={styles.importWarning}>
            <TriangleAlert aria-hidden="true" />
            <span>
              3 imported rules are enabled and start matching traffic immediately.
              They run in addition to your existing rules, so a request can match twice.
            </span>
          </div>
        </div>
        <footer className={styles.importFooter}>
          <button className={fixtureClassNames('btn')} type="button" onClick={close}>Cancel</button>
          <button className={fixtureClassNames('btn pri')} type="button" onClick={close}>
            <Upload aria-hidden="true" />
            Import 6 rules
          </button>
        </footer>
      </section>
    </div>
  );
}
