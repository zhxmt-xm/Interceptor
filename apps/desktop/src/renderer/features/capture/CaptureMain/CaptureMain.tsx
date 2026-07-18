import { useLayoutEffect, useRef, useState } from 'react';

import { Splitter } from '../../../components';
import { HarTransferDialog } from '../HarTransferDialog/HarTransferDialog';
import { HttpsDecryptionDialog } from '../HttpsDecryptionDialog/HttpsDecryptionDialog';
import { RequestInspector } from '../RequestInspector/RequestInspector';
import { RequestList } from '../RequestList/RequestList';
import { useCaptureStore } from '../captureStore';
import styles from './CaptureMain.module.css';

const SPLITTER_TRACK_WIDTH = 1;
const MIN_LIST_WIDTH = 300;
const MIN_INSPECTOR_WIDTH = 360;

/** Capture workspace body: request list, draggable splitter and inspector. */
export function CaptureMain(): React.JSX.Element {
  const inspectorWidth = useCaptureStore((state) => state.inspectorWidth);
  const setInspectorWidth = useCaptureStore((state) => state.setInspectorWidth);
  const [httpsSetupOpen, setHttpsSetupOpen] = useState(false);
  const mainRef = useRef<HTMLDivElement>(null);

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

  return (
    <>
      <div
        className={styles.main}
        ref={mainRef}
        style={{ gridTemplateColumns: `minmax(0, 1fr) ${SPLITTER_TRACK_WIDTH}px ${inspectorWidth}px` }}
      >
        <RequestList />
        <Splitter onPointerDown={startInspectorDrag} />
        <RequestInspector onSetupHttps={() => setHttpsSetupOpen(true)} />
      </div>
      <HarTransferDialog />
      <HttpsDecryptionDialog
        open={httpsSetupOpen}
        onClose={() => setHttpsSetupOpen(false)}
      />
    </>
  );
}
