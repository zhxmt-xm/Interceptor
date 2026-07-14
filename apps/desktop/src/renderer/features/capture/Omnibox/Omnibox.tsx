import { Activity, Dot, Filter, GitBranch, Globe, Layers, Search, X } from 'lucide-react';
import { useState } from 'react';

import { cx, MenuItem } from '../../../components';
import styles from './Omnibox.module.css';

/** Search/filter omnibox with active filter pills and an add-filter popover. */
export function Omnibox(): React.JSX.Element {
  const [showFilter, setShowFilter] = useState(false);

  return (
    <div className={styles.omnibox}>
      <Search className={styles.searchIcon} size={16} strokeWidth={1.9} />
      <span className={styles.pill}>
        GET
        <span className={styles.pillClose}>
          <X size={10} strokeWidth={2.2} />
        </span>
      </span>
      <span className={styles.pill}>
        2xx
        <span className={styles.pillClose}>
          <X size={10} strokeWidth={2.2} />
        </span>
      </span>
      <span className={styles.placeholder}>Filter requests…</span>
      <span className={styles.spacer} />
      <button
        type="button"
        className={cx(styles.filterButton, showFilter && styles.active)}
        onClick={() => setShowFilter((value) => !value)}
        aria-label="Add filter"
      >
        <Filter size={16} strokeWidth={1.9} />
      </button>
      {showFilter ? (
        <div className={styles.popover}>
          <div className={styles.popoverTitle}>Add filter</div>
          <MenuItem icon={GitBranch} name="Method" hint="GET, POST, DELETE…" />
          <MenuItem icon={Dot} name="Status" hint="2xx · 3xx · 4xx · 5xx" />
          <MenuItem icon={Layers} name="Type" hint="json, js, font, ws…" />
          <MenuItem icon={Globe} name="Host" hint="contains…" />
          <MenuItem icon={Activity} name="Duration" hint="> 500 ms" />
        </div>
      ) : null}
    </div>
  );
}
