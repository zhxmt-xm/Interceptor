import { RefreshCw, Trash2 } from 'lucide-react';
import { useEffect } from 'react';

import { IconButton } from '../../components/IconButton/IconButton';
import { fixtureClassNames } from '../../fixtures/FixtureRenderer';
import { useDesignState } from '../../state/useDesignState';
import styles from './CaptureStorageProposal.module.css';

export function CaptureStorageProposal(): React.JSX.Element {
  const { state, updateState } = useDesignState();
  const refreshing = state.storageOperation === 'refresh';
  const clearing = state.storageOperation === 'clear';
  const busy = state.storageOperation !== 'idle';
  const unavailable = state.storageStatus === 'unavailable';
  const bodyBytes = state.storageCleared ? '0 B' : '2.4 MB';

  useEffect(() => {
    if (state.storageOperation === 'idle') return undefined;
    const timer = window.setTimeout(() => updateState(state.storageOperation === 'clear'
      ? { storageCleared: true, storageConfirming: false, storageOperation: 'idle', storageStatus: 'ready' }
      : { storageOperation: 'idle', storageStatus: 'ready' }), 300);
    return () => window.clearTimeout(timer);
  }, [state.storageOperation, updateState]);

  return (
    <section className={styles.captureStorageProposal} data-review-panel="storage">
      <header className={styles.captureStorageHeading}>
        <h2>Storage</h2>
        <IconButton label="Refresh" disabled={busy} icon={<RefreshCw aria-hidden="true" />}
          className={refreshing ? styles.captureStorageRefreshing : undefined}
          onClick={() => updateState({ storageOperation: 'refresh' })} />
      </header>
      <div className={fixtureClassNames('desc2')}>Captured data is kept locally until you clear it or exit.</div>
      <div className={fixtureClassNames('sgroup')} aria-busy={refreshing}>
        <div className={fixtureClassNames('gh')}>Usage</div>
        <div className={fixtureClassNames('srow')} data-storage-summary="bytes">
          <div className={fixtureClassNames('scap')}>
            <b>{unavailable ? 'Storage status' : 'Captured body data'}</b>
            <span>{unavailable ? 'Storage usage could not be read.' : 'Captured content in memory and temporary files.'}</span>
          </div>
          <div className={fixtureClassNames('sctl')}>
            <span className={unavailable ? styles.captureStorageWarning : fixtureClassNames('mono2')}>
              {refreshing ? '\u2014' : unavailable ? 'Unavailable' : bodyBytes}
            </span>
          </div>
        </div>
      </div>
      {!unavailable ? <div className={fixtureClassNames('sgroup')}>
        <div className={fixtureClassNames('gh')}>Contents</div>
        {[
          { label: 'Sessions', value: '1' },
          { label: 'Exchanges', value: state.storageCleared ? '0' : '18' },
          { label: 'Stored bodies', value: state.storageCleared ? '0' : '31' },
        ].map(({ label, value }) => (
          <div className={fixtureClassNames('srow')} data-storage-count={label} key={label}>
            <div className={fixtureClassNames('scap')}><b>{label}</b></div>
            <div className={fixtureClassNames('sctl')}><span className={fixtureClassNames('mono2')}>{refreshing ? '\u2014' : value}</span></div>
          </div>
        ))}
      </div> : null}
      <div className={fixtureClassNames('sgroup')}>
        <div className={fixtureClassNames('gh')}>Maintenance</div>
        <div className={`${fixtureClassNames('srow')} ${styles.captureStorageClearRow}`}>
          <div className={fixtureClassNames('scap')}>
            <b>Clear capture</b>
            <span>Same as Clear in the Capture list. Removes captured requests and their bodies together.</span>
            <span>Saved files and recording state are unchanged. This cannot be undone.</span>
          </div>
          <div className={fixtureClassNames('sctl')}>
            {state.storageConfirming ? <>
              <button type="button" className={fixtureClassNames('btn')} disabled={clearing}
                onClick={() => updateState({ storageConfirming: false })}>Cancel</button>
              <button type="button" className={fixtureClassNames('btn danger')} disabled={busy}
                onClick={() => updateState({ storageOperation: 'clear' })}><Trash2 aria-hidden="true" /><span>{clearing ? 'Clearing\u2026' : 'Confirm clear'}</span></button>
            </> : <button type="button" className={fixtureClassNames('btn danger')} disabled={busy}
              onClick={() => updateState({ storageConfirming: true })}><Trash2 aria-hidden="true" /><span>{'Clear capture\u2026'}</span></button>}
          </div>
        </div>
      </div>
    </section>
  );
}