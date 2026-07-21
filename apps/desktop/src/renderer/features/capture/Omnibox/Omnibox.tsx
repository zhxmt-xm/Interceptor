import { Activity, Dot, Filter, GitBranch, Globe, Layers, Search, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { cx, Flyout, MenuItem } from '../../../components';
import { useCaptureStore } from '../data/captureStore';
import type { StructuredCaptureFilterField } from '../interfaces';
import { parseStructuredFilter } from '../utils';
import styles from './Omnibox.module.css';

/** Search/filter omnibox with active filter pills and an add-filter popover. */
export function Omnibox(): React.JSX.Element {
  const { t } = useTranslation();
  const [showFilter, setShowFilter] = useState(false);
  const [pendingField, setPendingField] =
    useState<StructuredCaptureFilterField | null>(null);
  const [pendingValue, setPendingValue] = useState('');
  const search = useCaptureStore((state) => state.filter.search);
  const method = useCaptureStore((state) => state.filter.method);
  const status = useCaptureStore((state) => state.filter.status);
  const host = useCaptureStore((state) => state.filter.host);
  const type = useCaptureStore((state) => state.filter.type);
  const minDurationMs = useCaptureStore((state) => state.filter.minDurationMs);
  const setSearch = useCaptureStore((state) => state.setSearch);
  const setStructuredFilter = useCaptureStore((state) => state.setStructuredFilter);
  const inputRef = useRef<HTMLInputElement>(null);

  const beginStructuredFilter = (field: StructuredCaptureFilterField): void => {
    setShowFilter(false);
    setPendingValue(pendingField ? pendingValue : search);
    setPendingField(field);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  };

  const cancelStructuredFilter = (): void => {
    setPendingField(null);
    setPendingValue('');
    window.requestAnimationFrame(() => inputRef.current?.focus());
  };

  const submitStructuredFilter = (): void => {
    if (!pendingField) {
      return;
    }
    const patch = parseStructuredFilter(pendingField, pendingValue);
    if (!patch) {
      inputRef.current?.focus();
      inputRef.current?.select();
      return;
    }
    setStructuredFilter(patch);
    setSearch('');
    setPendingField(null);
    setPendingValue('');
  };

  const pendingLabel = pendingField ? t(`capture.${pendingField}`) : null;
  const pendingPlaceholder = pendingField === 'method'
    ? 'GET, POST, DELETE…'
    : pendingField === 'status'
      ? '200, 404, 500…'
      : pendingField === 'type'
        ? 'json, js, font, ws…'
        : pendingField === 'duration'
          ? '≥ 500 ms'
          : pendingField === 'host'
            ? t('capture.contains')
            : t('capture.filterRequests');

  return (
    <div className={styles.omnibox}>
      <span className={styles.searchArea}>
        <Search className={styles.searchIcon} size={14} strokeWidth={1.9} />
      </span>
      {pendingLabel ? (
        <span className={styles.pill}>
          {pendingLabel}
          <button
            type="button"
            className={styles.pillClose}
            aria-label={`${t('capture.clear')} ${pendingLabel}`}
            onClick={cancelStructuredFilter}
          >
            <X size={10} strokeWidth={2.2} />
          </button>
        </span>
      ) : null}
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
        value={pendingField ? pendingValue : search}
        placeholder={pendingPlaceholder}
        onChange={(event) => {
          if (pendingField) {
            setPendingValue(event.target.value);
          } else {
            setSearch(event.target.value);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && pendingField) {
            event.preventDefault();
            submitStructuredFilter();
          } else if (event.key === 'Escape' && pendingField) {
            cancelStructuredFilter();
          }
        }}
        aria-label={pendingLabel
          ? `${t('capture.addFilter')}: ${pendingLabel}`
          : t('capture.filterRequests')}
      />
      <Flyout
        open={showFilter}
        onOpenChange={setShowFilter}
        placement="bottomRight"
        className={styles.popover}
        content={
          <>
            <div className={styles.popoverTitle}>{t('capture.addFilter')}</div>
            <MenuItem
              icon={GitBranch}
              name={t('capture.method')}
              hint="GET, POST, DELETE…"
              onClick={() => beginStructuredFilter('method')}
            />
            <MenuItem
              icon={Dot}
              name={t('capture.status')}
              hint="200 · 404 · 500"
              onClick={() => beginStructuredFilter('status')}
            />
            <MenuItem
              icon={Layers}
              name={t('capture.type')}
              hint="json, js, font, ws…"
              onClick={() => beginStructuredFilter('type')}
            />
            <MenuItem
              icon={Globe}
              name={t('capture.host')}
              hint={t('capture.contains')}
              onClick={() => beginStructuredFilter('host')}
            />
            <MenuItem
              icon={Activity}
              name={t('capture.duration')}
              hint="≥ 500 ms"
              onClick={() => beginStructuredFilter('duration')}
            />
          </>
        }
      >
        <button
          type="button"
          className={cx(styles.filterButton, showFilter && styles.active)}
          aria-label={t('capture.addFilter')}
        >
          <Filter size={16} strokeWidth={1.9} />
        </button>
      </Flyout>
    </div>
  );
}

