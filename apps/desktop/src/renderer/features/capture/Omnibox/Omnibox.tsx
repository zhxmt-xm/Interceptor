import { Activity, Dot, Filter, GitBranch, Globe, Layers, Search, X } from 'lucide-react';
import { useRef, useState } from 'react';

import { cx, MenuItem } from '../../../components';
import { useCaptureStore } from '../captureStore';
import styles from './Omnibox.module.css';

/** Search/filter omnibox with active filter pills and an add-filter popover. */
export function Omnibox(): React.JSX.Element {
  const [showFilter, setShowFilter] = useState(false);
  const search = useCaptureStore((state) => state.filter.search);
  const method = useCaptureStore((state) => state.filter.method);
  const status = useCaptureStore((state) => state.filter.status);
  const host = useCaptureStore((state) => state.filter.host);
  const setSearch = useCaptureStore((state) => state.setSearch);
  const setStructuredFilter = useCaptureStore((state) => state.setStructuredFilter);
  const inputRef = useRef<HTMLInputElement>(null);

  // 从当前关键字文本提炼一个结构化过滤条件，随后清空关键字。
  const promoteToFilter = (field: 'method' | 'status' | 'host'): void => {
    setShowFilter(false);
    const text = search.trim();
    if (field === 'method' && text) {
      setStructuredFilter({ method: text.toUpperCase() });
      setSearch('');
    } else if (field === 'status') {
      const code = Number(text);
      if (Number.isInteger(code) && code >= 100 && code <= 599) {
        setStructuredFilter({ status: code });
        setSearch('');
      }
    } else if (field === 'host' && text) {
      setStructuredFilter({ host: text });
      setSearch('');
    }
    inputRef.current?.focus();
  };

  return (
    <div className={styles.omnibox}>
      <Search className={styles.searchIcon} size={16} strokeWidth={1.9} />
      {method ? (
        <span className={styles.pill}>
          {method}
          <span
            className={styles.pillClose}
            onClick={() => setStructuredFilter({ method: null })}
          >
            <X size={10} strokeWidth={2.2} />
          </span>
        </span>
      ) : null}
      {status !== null ? (
        <span className={styles.pill}>
          {status}
          <span
            className={styles.pillClose}
            onClick={() => setStructuredFilter({ status: null })}
          >
            <X size={10} strokeWidth={2.2} />
          </span>
        </span>
      ) : null}
      {host ? (
        <span className={styles.pill}>
          {host}
          <span
            className={styles.pillClose}
            onClick={() => setStructuredFilter({ host: null })}
          >
            <X size={10} strokeWidth={2.2} />
          </span>
        </span>
      ) : null}
      <input
        ref={inputRef}
        className={styles.input}
        type="text"
        value={search}
        placeholder="Filter requests…"
        onChange={(event) => setSearch(event.target.value)}
        aria-label="Filter requests"
      />
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
          <MenuItem
            icon={GitBranch}
            name="Method"
            hint="GET, POST, DELETE…"
            onClick={() => promoteToFilter('method')}
          />
          <MenuItem
            icon={Dot}
            name="Status"
            hint="2xx · 3xx · 4xx · 5xx"
            onClick={() => promoteToFilter('status')}
          />
          <MenuItem icon={Layers} name="Type" hint="json, js, font, ws…" />
          <MenuItem
            icon={Globe}
            name="Host"
            hint="contains…"
            onClick={() => promoteToFilter('host')}
          />
          <MenuItem icon={Activity} name="Duration" hint="> 500 ms" />
        </div>
      ) : null}
    </div>
  );
}

