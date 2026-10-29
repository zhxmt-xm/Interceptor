import { useEffect, useLayoutEffect, useRef } from 'react';

import type {
  CaptureExchangeSummary,
  RuleActionType,
} from '../../../../shared/desktop-api';
import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
import { Splitter } from '../../../components';
import type { BreakpointScope } from '../../rules/interfaces';
import { CaptureFilterPanel } from '../CaptureFilterPanel/CaptureFilterPanel';
import { CaptureListbar } from '../CaptureListbar/CaptureListbar';
import { HarTransferDialog } from '../HarTransferDialog/HarTransferDialog';
import { HttpsDecryptionDialog } from '../HttpsDecryptionDialog/HttpsDecryptionDialog';
import { RequestInspector } from '../RequestInspector/RequestInspector';
import { RequestList } from '../RequestList/RequestList';
import { useCaptureStore } from '../data/captureStore';
import { refreshLinkStatus } from '../data/useCaptureData';
import styles from './CaptureMain.module.css';

const SPLITTER_TRACK_WIDTH = 1;
/** 全部列可见所需的列表宽度（紧凑档）；低于此值 container query 才开始递次隐列。 */
const MIN_LIST_WIDTH = 512;
const MIN_INSPECTOR_WIDTH = 360;
const MIN_FILTER_PANEL_WIDTH = 160;
const MAX_FILTER_PANEL_WIDTH = 360;

/**
 * 拖拽分栏时只改真实 DOM 尺寸，pointerup 才提交 Store。
 *
 * 每次 pointermove 都写 Store 会重建整个 Capture 视图，连带重跑列表虚拟化、
 * Inspector 与 KV 换行测量；直接写目标节点的布局尺寸把一帧内的多次移动合并成一次。
 */
function trackPaneWidthDrag(
  event: React.PointerEvent,
  widthAt: (clientX: number) => number,
  apply: (width: number) => void,
  commit: (width: number) => void,
): void {
  event.preventDefault();
  const captureTarget = event.currentTarget;
  const pointerId = event.pointerId;
  let width = widthAt(event.clientX);
  let frame: number | null = null;
  try {
    captureTarget.setPointerCapture(pointerId);
  } catch {
    /* 指针捕获不可用时仍靠 window 监听完成拖拽。 */
  }
  const paint = (): void => {
    frame = null;
    apply(width);
  };
  const onMove = (move: PointerEvent): void => {
    width = widthAt(move.clientX);
    if (frame === null) {
      frame = requestAnimationFrame(paint);
    }
  };
  const finish = (): void => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', finish);
    window.removeEventListener('pointercancel', finish);
    window.removeEventListener('blur', finish);
    if (captureTarget.hasPointerCapture(pointerId)) {
      captureTarget.releasePointerCapture(pointerId);
    }
    if (frame !== null) {
      cancelAnimationFrame(frame);
      frame = null;
    }
    apply(width);
    commit(width);
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', finish);
  window.addEventListener('pointercancel', finish);
  window.addEventListener('blur', finish);
}

export interface CaptureMainProps {
  onCreateRequestRule: (
    summary: CaptureExchangeSummary,
    actionType: RuleActionType,
    name: string,
  ) => void;
  onCreateBreakpoint: (
    summary: CaptureExchangeSummary,
    scope: BreakpointScope | 'custom',
    name: string,
  ) => void;
  onOpenRule: (ruleId: string) => void;
  onOpenRules: () => void;
  onViewTlsPassthroughPattern(host: string): void;
}

/** Capture workspace body: request list, draggable splitter and inspector. */
export function CaptureMain({
  onCreateRequestRule,
  onCreateBreakpoint,
  onOpenRule,
  onOpenRules,
  onViewTlsPassthroughPattern,
}: CaptureMainProps): React.JSX.Element {
  const inspectorWidth = useCaptureStore((state) => state.inspectorWidth);
  const setInspectorWidth = useCaptureStore((state) => state.setInspectorWidth);
  const filterPanelWidth = useCaptureStore((state) => state.filterPanelWidth);
  const setFilterPanelWidth = useCaptureStore((state) => state.setFilterPanelWidth);
  const filtersOpen = useCaptureStore((state) => state.filtersOpen);
  const selectedId = useCaptureStore((state) => state.selectedId);
  const httpsSetupOpen = useCaptureStore((state) => state.httpsSetupOpen);
  const setHttpsSetupOpen = useCaptureStore((state) => state.setHttpsSetupOpen);
  const mainRef = useRef<HTMLDivElement>(null);
  const filterPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void refreshLinkStatus();
  }, []);

  useLayoutEffect(() => {
    const element = mainRef.current;
    if (!element) {
      return;
    }
    const constrain = (): void => {
      const maximum = Math.max(
        MIN_INSPECTOR_WIDTH,
        element.clientWidth - MIN_LIST_WIDTH - SPLITTER_TRACK_WIDTH,
      );
      const current = useCaptureStore.getState().inspectorWidth;
      setInspectorWidth(
        Math.min(Math.max(current, MIN_INSPECTOR_WIDTH), maximum),
      );
    };
    constrain();
    const observer = new ResizeObserver(constrain);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const startInspectorDrag = (event: React.PointerEvent): void => {
    const element = mainRef.current;
    if (!element) {
      return;
    }
    const startX = event.clientX;
    const startWidth = useCaptureStore.getState().inspectorWidth;
    const maximum = Math.max(
      MIN_INSPECTOR_WIDTH,
      element.clientWidth - MIN_LIST_WIDTH - SPLITTER_TRACK_WIDTH,
    );
    trackPaneWidthDrag(
      event,
      (clientX) => Math.min(
        Math.max(startWidth - (clientX - startX), MIN_INSPECTOR_WIDTH),
        maximum,
      ),
      (width) => {
        element.style.gridTemplateColumns =
          `minmax(0, 1fr) ${SPLITTER_TRACK_WIDTH}px ${width}px`;
      },
      setInspectorWidth,
    );
  };

  const startFilterPanelDrag = (event: React.PointerEvent): void => {
    const element = filterPanelRef.current;
    if (!element) {
      return;
    }
    const startX = event.clientX;
    const startWidth = useCaptureStore.getState().filterPanelWidth;
    trackPaneWidthDrag(
      event,
      (clientX) => Math.min(
        Math.max(startWidth + (clientX - startX), MIN_FILTER_PANEL_WIDTH),
        MAX_FILTER_PANEL_WIDTH,
      ),
      (width) => {
        element.style.width = `${width}px`;
      },
      setFilterPanelWidth,
    );
  };

  return (
    <>
      <div className={styles.workspace}>
        {filtersOpen ? (
          <>
            <div className={styles.filterPanel} style={{ width: filterPanelWidth }} ref={filterPanelRef}>
              <CaptureFilterPanel />
            </div>
            <Splitter
              onPointerDown={startFilterPanelDrag}
              automationId={AUTOMATION_IDS.capture.filterPanelSplitter}
            />
          </>
        ) : null}
        <div className={styles.workarea}>
          <CaptureListbar onOpenRule={onOpenRule} onOpenRules={onOpenRules} />
          <div
            className={styles.panes}
            ref={mainRef}
            style={{ gridTemplateColumns: selectedId
              ? `minmax(0, 1fr) ${SPLITTER_TRACK_WIDTH}px ${inspectorWidth}px`
              : 'minmax(0, 1fr)' }}
          >
            <RequestList
              onCreateRequestRule={onCreateRequestRule}
              onCreateBreakpoint={onCreateBreakpoint}
            />
            {selectedId ? (
              <>
                <Splitter
                  onPointerDown={startInspectorDrag}
                  automationId={AUTOMATION_IDS.capture.inspector.splitter}
                />
                <RequestInspector
                  onOpenRule={onOpenRule}
                  onViewTlsPassthroughPattern={onViewTlsPassthroughPattern}
                />
              </>
            ) : null}
          </div>
        </div>
      </div>
      <HarTransferDialog />
      <HttpsDecryptionDialog
        open={httpsSetupOpen}
        onClose={() => setHttpsSetupOpen(false)}
        onCertificateChange={() => void refreshLinkStatus()}
      />
    </>
  );
}
