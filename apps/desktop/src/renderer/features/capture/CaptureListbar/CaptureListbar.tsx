import { Tooltip } from 'antd';
import {
  Ampersand,
  Archive,
  Download,
  FileJson,
  FunnelX,
  Loader2,
  PanelLeft,
  Pause,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AUTOMATION_IDS, type AutomationId } from '../../../../shared/automation-ids';
import { cx, Flyout, IconButton } from '../../../components';
import { useBreakpointsStore } from '../../breakpoints';
import { useRulesStore } from '../../rules/data/rulesStore';
import { BreakpointManager } from '../BreakpointManager/BreakpointManager';
import { useCaptureStore } from '../data/captureStore';
import { toggleCapture } from '../data/useCaptureData';
import type { CaptureTransferAction } from '../interfaces';
import { hasActiveFilter, visibleCaptureRows } from '../utils';
import styles from './CaptureListbar.module.css';
import { FileCommand } from './FileCommand';

export interface CaptureListbarProps {
  /** 打开 Rules 工作区并选中一条规则。 */
  onOpenRule: (ruleId: string) => void;
  /** 打开 Rules 工作区做精细编辑。 */
  onOpenRules: () => void;
}

/** Capture 列表工具栏：横跨列表与 Inspector，承载录制、断点、搜索、筛选开关与文件命令。 */
export function CaptureListbar({
  onOpenRule,
  onOpenRules,
}: CaptureListbarProps): React.JSX.Element {
  const { t } = useTranslation();
  const rows = useCaptureStore((state) => state.rows);
  const filter = useCaptureStore((state) => state.filter);
  const filtersOpen = useCaptureStore((state) => state.filtersOpen);
  const toggleFiltersOpen = useCaptureStore((state) => state.toggleFiltersOpen);
  const setSearch = useCaptureStore((state) => state.setSearch);
  const clearAllFilters = useCaptureStore((state) => state.clearAllFilters);
  const clearView = useCaptureStore((state) => state.clearView);
  const showQueryParams = useCaptureStore((state) => state.showQueryParams);
  const toggleQueryParams = useCaptureStore((state) => state.toggleQueryParams);
  const setTransferAction = useCaptureStore((state) => state.setTransferAction);
  const capturing = useCaptureStore((state) =>
    state.capturing && state.proxyReadinessIssue === null);
  const [fileMenu, setFileMenu] = useState<'import' | 'export' | null>(null);
  const [recordingPending, setRecordingPending] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);
  const breakpointsEnabled = useBreakpointsStore((state) => state.enabled);
  const pausedCount = useBreakpointsStore((state) => state.breakpoints.length);

  const visibleCount = useMemo(() => visibleCaptureRows(rows, filter).length, [rows, filter]);
  const filtered = hasActiveFilter(filter);
  const hasRecords = rows.length > 0;

  const openTransfer = (action: CaptureTransferAction): void => {
    setFileMenu(null);
    setTransferAction(action);
  };

  const onToggleRecording = async (): Promise<void> => {
    if (recordingPending) {
      return;
    }
    setRecordingPending(true);
    try {
      await toggleCapture();
    } finally {
      setRecordingPending(false);
    }
  };

  const clearRecordedTraffic = (): void => {
    if (clearing) {
      return;
    }
    const clearedBefore = Date.now();
    setClearing(true);
    void window.interceptor.clearCapture()
      .then(() => {
        clearView(clearedBefore);
        // 命中数是从 Capture 记录派生的，清空后必须立即归零，而不是等下一次轮询。
        useRulesStore.getState().setHits([]);
      })
      .catch((error: unknown) => {
        useCaptureStore.getState().loadFailed(
          error instanceof Error ? error.message : String(error),
        );
      })
      .finally(() => setClearing(false));
  };

  return (
    <div className={styles.listbar}>
      <div className={styles.start}>
        <span className={styles.filtersToggle}>
          <IconButton
            icon={PanelLeft}
            size="sm"
            className={filtersOpen ? styles.toggleOn : styles.toggleOff}
            label={t('capture.toggleFilters')}
            onClick={toggleFiltersOpen}
            automationId={AUTOMATION_IDS.capture.filtersToggle}
          />
          {filtered ? <span className={styles.filtersBadge} /> : null}
        </span>
        <Tooltip
          title={capturing ? t('capture.stopRecording') : t('capture.startRecording')}
          mouseEnterDelay={0.4}
        >
          <button
            type="button"
            className={cx(styles.recording, !capturing && styles.paused)}
            onClick={() => void onToggleRecording()}
            aria-pressed={capturing}
            aria-busy={recordingPending}
            data-automation-id={AUTOMATION_IDS.capture.recordingToggle}
            data-parity="capture-recording-toggle"
          >
            {recordingPending ? (
              <Loader2 className={styles.recordingSpinner} size={15} strokeWidth={2} />
            ) : (
              <span className={styles.recordingDot} />
            )}
            <span>{capturing ? t('capture.recording') : t('capture.paused')}</span>
          </button>
        </Tooltip>
        <Flyout
          open={managerOpen}
          onOpenChange={setManagerOpen}
          placement="bottomLeft"
          content={
            <BreakpointManager
              onOpenRule={(ruleId) => {
                setManagerOpen(false);
                onOpenRule(ruleId);
              }}
              onOpenAdvanced={() => {
                setManagerOpen(false);
                onOpenRules();
              }}
              onClose={() => setManagerOpen(false)}
            />
          }
        >
          <Tooltip
            title={
              breakpointsEnabled
                ? t('breakpoints.pausedCount', { count: pausedCount })
                : t('breakpoints.matchState', { state: t('breakpoints.off') })
            }
            mouseEnterDelay={0.4}
          >
            <button
              type="button"
              className={cx(styles.breakpoints, !breakpointsEnabled && styles.breakpointsOff)}
              aria-label={t('breakpoints.managerTitle')}
              aria-expanded={managerOpen}
              data-automation-id={AUTOMATION_IDS.capture.breakpointManager}
            >
              <Pause size={14} strokeWidth={2} />
              {pausedCount > 0 ? (
                <span className={styles.breakpointsCount}>{pausedCount}</span>
              ) : null}
            </button>
          </Tooltip>
        </Flyout>
        <IconButton
          icon={Trash2}
          size="sm"
          label={t('capture.clear')}
          disabled={!hasRecords}
          onClick={clearRecordedTraffic}
          automationId={AUTOMATION_IDS.capture.clear}
        />
      </div>

      <div className={styles.search}>
        <div className={styles.omni}>
          <Search className={styles.omniIcon} size={14} strokeWidth={1.9} />
          <input
            className={styles.omniInput}
            type="text"
            value={filter.search}
            placeholder={t('capture.filterRequests')}
            onChange={(event) => setSearch(event.target.value)}
            data-automation-id={AUTOMATION_IDS.capture.keywordFilter}
            data-parity="capture-filter-search-value"
          />
          {filter.search ? (
            <button
              type="button"
              className={styles.omniClear}
              onClick={() => setSearch('')}
              aria-label={t('capture.clearSearch')}
              title={t('capture.clearSearch')}
              data-automation-id={AUTOMATION_IDS.capture.clearSearch}
              data-parity="capture-filter-search-clear"
            >
              <X size={13} strokeWidth={2.2} />
            </button>
          ) : null}
        </div>
        <span data-parity="capture-filter-clear-all">
          <IconButton
            icon={FunnelX}
            size="sm"
            disabled={!filtered}
            label={t('capture.clearAllFilters')}
            onClick={clearAllFilters}
            automationId={AUTOMATION_IDS.capture.clearFilters}
          />
        </span>
      </div>

      <div className={styles.end}>
        <span className={styles.count} data-parity="capture-visible-count">
          {t('capture.visibleCount', { visible: visibleCount, total: rows.length })}
        </span>
        <div className={styles.iconActions}>
          <IconButton
            icon={Ampersand}
            size="sm"
            className={showQueryParams ? styles.toggleOn : undefined}
            label={t('capture.queryParams')}
            onClick={toggleQueryParams}
            automationId={AUTOMATION_IDS.capture.queryParams}
          />
          <Flyout
            open={fileMenu === 'import'}
            onOpenChange={(next) => setFileMenu(next ? 'import' : null)}
            placement="bottomRight"
            className={styles.fileMenu}
            content={
              <>
                <FileCommand
                  icon={FileJson}
                  label={t('capture.importHar')}
                  extension=".har"
                  automationId={AUTOMATION_IDS.capture.importHar}
                  onClick={() => openTransfer('har-import')}
                />
                <FileCommand
                  icon={Archive}
                  label={t('capture.openCapture')}
                  extension=".iarchive"
                  automationId={AUTOMATION_IDS.capture.openArchive}
                  onClick={() => openTransfer('archive-import')}
                />
              </>
            }
          >
            <span className={styles.fileAnchor}>
              <IconButton
                icon={Upload}
                size="sm"
                label={t('capture.importTraffic')}
                automationId={AUTOMATION_IDS.capture.importMenu}
              />
            </span>
          </Flyout>
          <Flyout
            open={fileMenu === 'export' && hasRecords}
            onOpenChange={(next) => setFileMenu(next && hasRecords ? 'export' : null)}
            placement="bottomRight"
            className={styles.fileMenu}
            content={
              <>
                <FileCommand
                  icon={FileJson}
                  label={t('capture.exportHar')}
                  extension=".har"
                  automationId={AUTOMATION_IDS.capture.exportHar}
                  onClick={() => openTransfer('har-export')}
                />
                <FileCommand
                  icon={Archive}
                  label={t('capture.saveCapture')}
                  extension=".iarchive"
                  automationId={AUTOMATION_IDS.capture.saveArchive}
                  onClick={() => openTransfer('archive-export')}
                />
              </>
            }
          >
            <span className={styles.fileAnchor}>
              <IconButton
                icon={Download}
                size="sm"
                disabled={!hasRecords}
                disabledTooltip={t('capture.noRecordsToExport')}
                label={t('capture.exportTraffic')}
                automationId={AUTOMATION_IDS.capture.exportMenu}
              />
            </span>
          </Flyout>
        </div>
      </div>
    </div>
  );
}
