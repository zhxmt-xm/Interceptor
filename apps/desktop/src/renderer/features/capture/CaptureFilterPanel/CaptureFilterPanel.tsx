import { X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
import type { CaptureExchangeSummary } from '../../../../shared/desktop-api';
import { cx } from '../../../components';
import { CAPTURE_FACET_IDS, FACET_REFRESH_MS } from '../constants';
import { useCaptureStore } from '../data/captureStore';
import { CAPTURE_FACET_FIELDS, type CaptureFacetId } from '../interfaces';
import { allFacetOptions } from '../utils';
import styles from './CaptureFilterPanel.module.css';
import { FacetGroup } from './FacetGroup';
import { useThrottledRows } from './useThrottledRows';

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
