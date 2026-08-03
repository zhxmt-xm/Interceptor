import { AppWindow, ChevronDown, Lock, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
import type { CaptureExchangeSummary } from '../../../../shared/desktop-api';
import { cx, MethodBadge } from '../../../components';
import { useRulesStore } from '../../rules/data/rulesStore';
import {
  CAPTURE_FACET_IDS,
  FAILED_FACET_VALUE,
  PENDING_FACET_VALUE,
  UNKNOWN_FACET_VALUE,
} from '../constants';
import { useCaptureStore } from '../data/captureStore';
import {
  CAPTURE_FACET_FIELDS,
  type CaptureFacetId,
  type FilterValueOption,
} from '../interfaces';
import { allFacetOptions, statusKind } from '../utils';
import styles from './CaptureFilterPanel.module.css';

/** 每组默认最多显示的条目数，其余折叠到 Show more 之后。 */
const COLLAPSED_LIMIT = 8;

/** facet 计数的重算间隔；实时流量下每条事件都重排会让整个分栏持续抖动。 */
const FACET_REFRESH_MS = 600;

const FACET_LABEL_KEYS: Record<CaptureFacetId, string> = {
  application: 'capture.application',
  method: 'capture.method',
  host: 'capture.host',
  status: 'capture.status',
  protocol: 'capture.protocol',
  type: 'capture.contentType',
  rule: 'capture.rule',
};

/** Capture 左侧筛选分栏：facet 顺序严格跟随列表表头，点击即生效。 */
export function CaptureFilterPanel(): React.JSX.Element {
  const rows = useThrottledRows(FACET_REFRESH_MS);
  const options = useMemo(() => allFacetOptions(rows), [rows]);
  const [expandedGroups, setExpandedGroups] = useState<CaptureFacetId[]>([]);

  const showAllOf = (facet: CaptureFacetId): void =>
    setExpandedGroups((current) => [...current, facet]);

  return (
    <aside className={styles.panel} data-parity="capture-filter-panel">
      <div className={styles.scroll} data-parity="capture-filter-groups">
        {CAPTURE_FACET_IDS.map((facet) => (
          <FacetGroup
            key={facet}
            facet={facet}
            options={options[facet]}
            total={rows.length}
            showAll={expandedGroups.includes(facet)}
            onShowAll={() => showAllOf(facet)}
          />
        ))}
      </div>
    </aside>
  );
}

interface FacetGroupProps {
  facet: CaptureFacetId;
  options: FilterValueOption[];
  total: number;
  showAll: boolean;
  onShowAll(): void;
}

/** 按固定间隔取一次列表快照；首次与空闲时立即生效，高频时最多滞后一个间隔。 */
function useThrottledRows(intervalMs: number): CaptureExchangeSummary[] {
  const rows = useCaptureStore((state) => state.rows);
  const [snapshot, setSnapshot] = useState(rows);
  const lastAppliedRef = useRef(0);

  useEffect(() => {
    const elapsed = Date.now() - lastAppliedRef.current;
    if (elapsed >= intervalMs) {
      lastAppliedRef.current = Date.now();
      setSnapshot(rows);
      return;
    }
    const timer = window.setTimeout(() => {
      lastAppliedRef.current = Date.now();
      setSnapshot(rows);
    }, intervalMs - elapsed);
    return () => window.clearTimeout(timer);
  }, [rows, intervalMs]);

  return snapshot;
}

/** 单个 facet 分组：组头可折叠，组内多选按 OR。 */
function FacetGroup({
  facet,
  options,
  total,
  showAll,
  onShowAll,
}: FacetGroupProps): React.JSX.Element {
  const { t } = useTranslation();
  const selected = useCaptureStore((state) => state.filter[CAPTURE_FACET_FIELDS[facet]]);
  const open = useCaptureStore((state) => state.expandedFacets.includes(facet));
  const toggleExpanded = useCaptureStore((state) => state.toggleFacetExpanded);
  const toggleValue = useCaptureStore((state) => state.toggleFacetValue);
  const clearFacet = useCaptureStore((state) => state.clearFacet);

  const applied = selected.length > 0;
  const visible = showAll ? options : options.slice(0, COLLAPSED_LIMIT);
  const hidden = options.length - visible.length;

  return (
    <section className={cx(styles.group, open && styles.groupOpen)}>
      <div className={styles.groupHead}>
        <button
          type="button"
          className={styles.groupToggle}
          onClick={() => toggleExpanded(facet)}
          aria-expanded={open}
        >
          <ChevronDown className={styles.groupChevron} size={13} strokeWidth={1.9} />
          <span className={styles.groupName}>{t(FACET_LABEL_KEYS[facet])}</span>
        </button>
        <span className={cx(styles.groupCount, applied && styles.groupCountApplied)}>
          {options.length}
        </span>
        {applied ? (
          <button
            type="button"
            className={styles.groupClear}
            onClick={() => clearFacet(facet)}
            aria-label={t('capture.clearGroupFilter', { group: t(FACET_LABEL_KEYS[facet]) })}
            title={t('capture.clear')}
          >
            <X size={12} strokeWidth={2.2} />
          </button>
        ) : null}
      </div>
      {open ? (
        <div className={styles.groupBody}>
          {facet === 'rule' && options.length === 0 ? (
            <p className={styles.groupEmpty}>{t('capture.noRuleMatches')}</p>
          ) : (
            <>
              <button
                type="button"
                className={cx(styles.item, !applied && styles.itemOn)}
                onClick={() => clearFacet(facet)}
                data-parity="capture-filter-item-all"
              >
                <span className={styles.itemName}>{t('capture.all')}</span>
                <span className={styles.itemCount}>{total}</span>
              </button>
              {visible.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={cx(styles.item, selected.includes(option.value) && styles.itemOn)}
                  onClick={() => toggleValue(facet, option.value)}
                  data-automation-id={AUTOMATION_IDS.capture.filterOption[facet]}
                  data-parity="capture-filter-item"
                >
                  <FacetValueLabel facet={facet} value={option.value} />
                  <span className={styles.itemCount}>{option.count}</span>
                </button>
              ))}
              {hidden > 0 ? (
                <button type="button" className={styles.groupMore} onClick={onShowAll}>
                  {t('capture.showMore', { count: hidden })}
                </button>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}

/** facet 条目的值渲染：每个分组用与列表同源的视觉表达。 */
function FacetValueLabel({
  facet,
  value,
}: {
  facet: CaptureFacetId;
  value: string;
}): React.JSX.Element {
  const { t } = useTranslation();
  const icon = useCaptureStore((state) =>
    facet === 'application' ? state.clientAppIcons.get(value) : undefined);
  const appName = useCaptureStore((state) =>
    facet === 'application'
      ? state.rows.find((row) => row.appId === value)?.appName
      : undefined);
  const ruleName = useRulesStore((state) =>
    facet === 'rule' ? state.rules.find((rule) => rule.id === value)?.name : undefined);

  if (facet === 'application') {
    return (
      <>
        {icon ? (
          <img className={styles.itemAppIcon} src={icon} alt="" />
        ) : (
          <AppWindow className={styles.itemAppUnknown} size={13} strokeWidth={1.8} />
        )}
        <span className={styles.itemName}>
          {value === UNKNOWN_FACET_VALUE ? t('capture.unknownApplication') : appName ?? value}
        </span>
      </>
    );
  }
  if (facet === 'method') {
    return <MethodBadge method={value} />;
  }
  if (facet === 'host') {
    return (
      <>
        <Lock className={styles.itemLock} size={13} strokeWidth={2.2} />
        <span className={styles.itemName}>{value}</span>
      </>
    );
  }
  if (facet === 'status') {
    return <StatusFacetValue value={value} />;
  }
  if (facet === 'protocol') {
    return <span className={styles.itemProtocol}>{value}</span>;
  }
  if (facet === 'rule') {
    return <span className={styles.itemName}>{ruleName ?? value}</span>;
  }
  return <span className={styles.itemName}>{value}</span>;
}

/** 状态码条目：数字码带语义色点，失败与未完成用哨兵文案。 */
function StatusFacetValue({ value }: { value: string }): React.JSX.Element {
  const { t } = useTranslation();
  if (value === FAILED_FACET_VALUE || value === PENDING_FACET_VALUE) {
    const failed = value === FAILED_FACET_VALUE;
    return (
      <span className={cx(styles.itemStatus, failed ? styles.statusErr : styles.statusInfo)}>
        <span className={styles.itemStatusDot} />
        {failed ? t('capture.statusFailed') : t('capture.statusPending')}
      </span>
    );
  }
  const code = Number.parseInt(value, 10);
  return (
    <span className={cx(styles.itemStatus, styles[statusKind(code)])}>
      <span className={styles.itemStatusDot} />
      {value}
    </span>
  );
}
