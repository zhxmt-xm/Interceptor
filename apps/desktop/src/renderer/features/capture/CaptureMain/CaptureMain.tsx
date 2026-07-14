import { useRef, useState } from 'react';

import { Splitter } from '../../../components';
import { RequestInspector } from '../RequestInspector/RequestInspector';
import { RequestList } from '../RequestList/RequestList';
import styles from './CaptureMain.module.css';

/** Capture workspace body: request list, draggable splitter and inspector. */
export function CaptureMain(): React.JSX.Element {
  const [selected, setSelected] = useState(0);
  const [inspectorWidth, setInspectorWidth] = useState(500);
  const mainRef = useRef<HTMLDivElement>(null);

  const startInspectorDrag = (event: React.PointerEvent): void => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = inspectorWidth;
    const total = mainRef.current?.clientWidth ?? 1200;
    const onMove = (move: PointerEvent): void => {
      const next = startWidth - (move.clientX - startX);
      setInspectorWidth(Math.min(Math.max(next, 360), Math.max(420, total - 420)));
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
      style={{ gridTemplateColumns: `minmax(0, 1fr) 7px ${inspectorWidth}px` }}
    >
      <RequestList selected={selected} onSelect={setSelected} />
      <Splitter onPointerDown={startInspectorDrag} />
      <RequestInspector />
    </div>
  );
}
