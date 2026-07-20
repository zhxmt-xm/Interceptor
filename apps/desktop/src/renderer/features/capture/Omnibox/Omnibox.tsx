import { Activity, Dot, Filter, GitBranch, Globe, Layers, Search, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { cx, MenuItem, useDismissOnOutside } from '../../../components';
import { useCaptureStore } from '../captureStore';
import styles from './Omnibox.module.css';

/** Search/filter omnibox with active filter pills and an add-filter popover. */
export function Omnibox(): React.JSX.Element {
  const { t } = useTranslation();
  const [showFilter, setShowFilter] = useState(false);
  const search = useCaptureStore((state) => state.filter.search);
  const method = useCaptureStore((state) => state.filter.method);
  const status = useCaptureStore((state) => state.filter.status);
  const host = useCaptureStore((state) => state.filter.host);
  const type = useCaptureStore((state) => state.filter.type);
  const minDurationMs = useCaptureStore((state) => state.filter.minDurationMs);
  const setSearch = useCaptureStore((state) => state.setSearch);
  const setStructuredFilter = useCaptureStore((state) => state.setStructuredFilter);
  const inputRef = useRef<HTMLInputElement>(null);
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useDismissOnOutside(showFilter, () => setShowFilter(false), [popoverRef, filterButtonRef]);

  // 从当前关键字文本提炼一个结构化过滤条件，随后清空关键字。
  const promoteToFilter = (
    field: 'method' | 'status' | 'host' | 'type' | 'duration',
  ): void => {
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
    } else if (field === 'type' && text) {
      setStructuredFilter({ type: text.toLowerCase() });
      setSearch('');
    } else if (field === 'duration') {
      const ms = Number.parseInt(text.replace(/[^0-9]/g, ''), 10);
      if (Number.isInteger(ms) && ms > 0) {
        setStructuredFilter({ minDurationMs: ms });
        setSearch('');
      }
    }
    inputRef.current?.focus();
  };

  return (
    <div className={styles.omnibox}>
      <span className={styles.searchArea}>
        <Search className={styles.searchIcon} size={14} strokeWidth={1.9} />
      </span>
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
      {type ? (
        <span className={styles.pill}>
          {type}
          <span
            className={styles.pillClose}
            onClick={() => setStructuredFilter({ type: null })}
          >
            <X size={10} strokeWidth={2.2} />
          </span>
        </span>
      ) : null}
      {minDurationMs !== null ? (
        <span className={styles.pill}>
          {`≥ ${minDurationMs} ms`}
          <span
            className={styles.pillClose}
            onClick={() => setStructuredFilter({ minDurationMs: null })}
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
        placeholder={t('capture.filterRequests')}
        onChange={(event) => setSearch(event.target.value)}
        aria-label={t('capture.filterRequests')}
      />
      <button
        ref={filterButtonRef}
        type="button"
        className={cx(styles.filterButton, showFilter && styles.active)}
        onClick={() => setShowFilter((value) => !value)}
        aria-label={t('capture.addFilter')}
      >
        <Filter size={16} strokeWidth={1.9} />
      </button>
      {showFilter ? (
        <div ref={popoverRef} className={styles.popover}>
          <div className={styles.popoverTitle}>{t('capture.addFilter')}</div>
          <MenuItem
            icon={GitBranch}
            name={t('capture.method')}
            hint="GET, POST, DELETE…"
            onClick={() => promoteToFilter('method')}
          />
          <MenuItem
            icon={Dot}
            name={t('capture.status')}
            hint="2xx · 3xx · 4xx · 5xx"
            onClick={() => promoteToFilter('status')}
          />
          <MenuItem
            icon={Layers}
            name={t('capture.type')}
            hint="json, js, font, ws…"
            onClick={() => promoteToFilter('type')}
          />
          <MenuItem
            icon={Globe}
            name={t('capture.host')}
            hint={t('capture.contains')}
            onClick={() => promoteToFilter('host')}
          />
          <MenuItem
            icon={Activity}
            name={t('capture.duration')}
            hint="> 500 ms"
            onClick={() => promoteToFilter('duration')}
          />
        </div>
      ) : null}
    </div>
  );
}

