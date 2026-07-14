import { useRef, useState } from 'react';

import { Splitter } from '../../../components';
import { BreakpointEditor } from '../BreakpointEditor/BreakpointEditor';
import { PausedQueue } from '../PausedQueue/PausedQueue';
import styles from './BreakpointsMain.module.css';

/** Breakpoints body: paused queue, draggable splitter and the request editor. */
export function BreakpointsMain(): React.JSX.Element {
  const [queueWidth, setQueueWidth] = useState(372);
  const mainRef = useRef<HTMLDivElement>(null);

  const startDrag = (event: React.PointerEvent): void => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = queueWidth;
    const total = mainRef.current?.clientWidth ?? 1200;
    const onMove = (move: PointerEvent): void => {
      const next = startWidth + (move.clientX - startX);
      setQueueWidth(Math.min(Math.max(next, 300), Math.max(360, total - 420)));
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
      style={{ gridTemplateColumns: `${queueWidth}px 7px minmax(0, 1fr)` }}
    >
      <PausedQueue />
      <Splitter onPointerDown={startDrag} />
      <BreakpointEditor />
    </div>
  );
}
