import { TriangleAlert, Upload, X } from 'lucide-react';

import { IconButton } from '../../components/IconButton/IconButton';
import { fixtureClassNames } from '../../fixtures/FixtureRenderer';
import { useDesignState } from '../../state/useDesignState';
import styles from './ComposerImportDialog.module.css';

const SKIPPED_ITEMS = [
  { path: 'Checkout / Create order', reason: 'The request URL must be text.' },
  { path: 'Checkout / Legacy ping', reason: 'Unsupported body type.' },
];

export function ComposerImportDialog(): React.JSX.Element | null {
  const { state, updateState } = useDesignState();
  if (state.overlay !== 'composer-import') {
    return null;
  }

  const close = (): void => updateState({ overlay: '' });
  return (
    <div
      className={styles.collectionImportOverlay}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <section aria-labelledby="import-collection-title" className={styles.collectionImportDialog}>
        <header className={styles.collectionImportHeader}>
          <span className={styles.collectionImportIcon}><Upload aria-hidden="true" /></span>
          <h2 id="import-collection-title">Import collection?</h2>
          <IconButton label="Close" icon={<X aria-hidden="true" />} onClick={close} />
        </header>
        <div className={styles.collectionImportContent}>
          <p>
            Append <b>9 requests</b> in <b>3 folders</b> to the end of your collection.
            Nothing existing is replaced or merged.
          </p>
          <div className={styles.collectionImportFile}>
            <span className={styles.collectionImportFileName}>interceptor-collection-2026-08-20.json</span>
          </div>
          <div className={styles.collectionImportSummary}>
            <div className={styles.collectionImportStat}>
              <span>Requests</span>
              <strong>9</strong>
            </div>
            <div className={styles.collectionImportStat}>
              <span>Folders</span>
              <strong>3</strong>
            </div>
            <div className={styles.collectionImportStat} data-emphasis="skipped">
              <span>Skipped</span>
              <strong>2</strong>
            </div>
          </div>
          <div className={styles.collectionImportSkipped}>
            <div className={styles.collectionImportSkippedHead}>
              <TriangleAlert aria-hidden="true" />
              <span>2 items cannot be imported and will be left out</span>
            </div>
            <ul className={styles.collectionImportSkippedList}>
              {SKIPPED_ITEMS.map((item) => (
                <li key={item.path}>
                  <span className={styles.collectionImportSkippedPath}>{item.path}</span>
                  <span className={styles.collectionImportSkippedReason}>{item.reason}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <footer className={styles.collectionImportFooter}>
          <button className={fixtureClassNames('btn')} type="button" onClick={close}>Cancel</button>
          <button className={fixtureClassNames('btn pri')} type="button" onClick={close}>
            <Upload aria-hidden="true" />
            Import 9 requests
          </button>
        </footer>
      </section>
    </div>
  );
}
