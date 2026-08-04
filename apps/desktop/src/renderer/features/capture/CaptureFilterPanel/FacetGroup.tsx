import { ChevronDown, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { AUTOMATION_IDS, AutomationIdFactory } from '../../../../shared/automation-ids';
import { Count, cx } from '../../../components';
import { FACET_COLLAPSED_LIMIT, FACET_LABEL_KEYS } from '../constants';
import { useCaptureStore } from '../data/captureStore';
import {
  CAPTURE_FACET_FIELDS,
  type CaptureFacetId,
  type FilterValueOption,
} from '../interfaces';

import { FacetValueLabel } from './FacetValueLabel';
import styles from './FacetGroup.module.css';

export interface FacetGroupProps {
  facet: CaptureFacetId;
  options: FilterValueOption[];
  total: number;
  showAll: boolean;
  onShowAll(): void;
}

/** 单个 facet 分组：组头可折叠，组内多选按 OR。 */
export function FacetGroup({
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
  const visible = showAll ? options : options.slice(0, FACET_COLLAPSED_LIMIT);
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
