import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import type {
  CaptureExchangeSummary,
  CertificateInfo,
  RuleActionType,
} from '../../../../shared/desktop-api';
import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
import { Splitter } from '../../../components';
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

export interface CaptureMainProps {
  onCreateRequestRule: (
    summary: CaptureExchangeSummary,
    actionType: RuleActionType,
    name: string,
  ) => void;
  onOpenRule: (ruleId: string) => void;
}

/** Capture workspace body: request list, draggable splitter and inspector. */
export function CaptureMain({
  onCreateRequestRule,
  onOpenRule,
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

  useEffect(() => {
    void refreshLinkStatus();
  }, []);

  useLayoutEffect(() => {
    document.documentElement.style.setProperty(
      '--capture-inspector-width',
      `${inspectorWidth}px`,
    );
    return () => {
      document.documentElement.style.removeProperty('--capture-inspector-width');
    };
  }, [inspectorWidth]);

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
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = inspectorWidth;
    const total = mainRef.current?.clientWidth ?? 1200;
    const onMove = (move: PointerEvent): void => {
      const next = startWidth - (move.clientX - startX);
      const maximum = Math.max(
        MIN_INSPECTOR_WIDTH,
        total - MIN_LIST_WIDTH - SPLITTER_TRACK_WIDTH,
      );
      setInspectorWidth(Math.min(Math.max(next, MIN_INSPECTOR_WIDTH), maximum));
    };
    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const startFilterPanelDrag = (event: React.PointerEvent): void => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = filterPanelWidth;
    const onMove = (move: PointerEvent): void => {
      const next = startWidth + (move.clientX - startX);
      setFilterPanelWidth(
        Math.min(Math.max(next, MIN_FILTER_PANEL_WIDTH), MAX_FILTER_PANEL_WIDTH),
      );
    };
    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <>
      <div className={styles.workspace}>
        {filtersOpen ? (
          <>
            <div className={styles.filterPanel} style={{ width: filterPanelWidth }}>
              <CaptureFilterPanel />
            </div>
            <Splitter
              onPointerDown={startFilterPanelDrag}
              automationId={AUTOMATION_IDS.capture.filterPanelSplitter}
            />
          </>
        ) : null}
        <div className={styles.workarea}>
          <CaptureListbar />
          <div
            className={styles.panes}
            ref={mainRef}
            style={{ gridTemplateColumns: selectedId
              ? `minmax(0, 1fr) ${SPLITTER_TRACK_WIDTH}px ${inspectorWidth}px`
              : 'minmax(0, 1fr)' }}
          >
            <RequestList onCreateRequestRule={onCreateRequestRule} />
            {selectedId ? (
              <>
                <Splitter
                  onPointerDown={startInspectorDrag}
                  automationId={AUTOMATION_IDS.capture.inspector.splitter}
                />
                <RequestInspector onOpenRule={onOpenRule} />
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
