import { useRef, useState } from 'react';

import { Splitter } from '../../../components';
import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
import { TraceDetail } from '../TraceDetail/TraceDetail';
import { TraceList } from '../TraceList/TraceList';
import styles from './DiagnosticsMain.module.css';

/** Diagnostics body: trace table, draggable splitter and the trace detail. */
export function DiagnosticsMain(): React.JSX.Element {
  const [detailWidth, setDetailWidth] = useState(468);
  const mainRef = useRef<HTMLDivElement>(null);

  const startDrag = (event: React.PointerEvent): void => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = detailWidth;
    const total = mainRef.current?.clientWidth ?? 1200;
    const onMove = (move: PointerEvent): void => {
      const next = startWidth - (move.clientX - startX);
      setDetailWidth(Math.min(Math.max(next, 360), Math.max(420, total - 420)));
    };
    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <div
      className={styles.main}
      ref={mainRef}
      style={{ gridTemplateColumns: `minmax(0, 1fr) 1px ${detailWidth}px` }}
    >
      <TraceList />
      <Splitter
        onPointerDown={startDrag}
        automationId={AUTOMATION_IDS.diagnostics.splitter}
      />
      <TraceDetail />
    </div>
  );
}
