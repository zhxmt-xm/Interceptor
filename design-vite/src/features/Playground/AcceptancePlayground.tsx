import { useRef, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';

import { useDesignState } from '../../state/useDesignState';
import { PlaygroundCatalog } from './PlaygroundCatalog';
import { PlaygroundHeader } from './PlaygroundHeader';
import { PlaygroundInspector } from './PlaygroundInspector';
import { PlaygroundNavigation } from './PlaygroundNavigation';
import { PlaygroundWorkbench } from './PlaygroundWorkbench';
import styles from './AcceptancePlayground.module.css';

export function AcceptancePlayground(): React.JSX.Element {
  const { state, updateState } = useDesignState();
  const pageBodyRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ readonly pointerId: number; readonly startX: number; readonly startWidth: number } | null>(null);
  const detailWidth = state.playgroundSection === 'capture'
    ? state.playgroundCaptureDetailWidth
    : state.playgroundMcpDetailWidth;
  const detailWidthStyle = { '--playground-detail-width': `${detailWidth}px` } as CSSProperties;

  const updateDetailWidth = (width: number): void => {
    updateState(state.playgroundSection === 'capture'
      ? { playgroundCaptureDetailWidth: width }
      : { playgroundMcpDetailWidth: width });
  };

  const resizeFromPointer = (event: PointerEvent<HTMLDivElement>): void => {
    if (dragRef.current?.pointerId !== event.pointerId || pageBodyRef.current === null) return;
    const maximum = Math.max(360, pageBodyRef.current.clientWidth - 260 - 440 - 1);
    const requested = dragRef.current.startWidth + dragRef.current.startX - event.clientX;
    updateDetailWidth(Math.min(maximum, Math.max(360, requested)));
  };

  const resizeFromKeyboard = (event: KeyboardEvent<HTMLDivElement>): void => {
    if ((event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') || pageBodyRef.current === null) return;
    event.preventDefault();
    const maximum = Math.max(360, pageBodyRef.current.clientWidth - 260 - 440 - 1);
    const requested = detailWidth + (event.key === 'ArrowLeft' ? 24 : -24);
    updateDetailWidth(Math.min(maximum, Math.max(360, requested)));
  };

  return (
    <main className={styles.playgroundRoot} data-parity="acceptance-playground">
      <PlaygroundNavigation />
      <section className={styles.playgroundPage}>
        <PlaygroundHeader />
        <div className={styles.playgroundBody} ref={pageBodyRef} style={detailWidthStyle}>
          <PlaygroundCatalog />
          <PlaygroundWorkbench />
          <div
            aria-label="Resize Response Detail"
            aria-orientation="vertical"
            aria-valuemax={679}
            aria-valuemin={360}
            aria-valuenow={detailWidth}
            className={styles.playgroundSplitter}
            role="separator"
            tabIndex={0}
            onKeyDown={resizeFromKeyboard}
            onPointerDown={(event) => {
              dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: detailWidth };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={resizeFromPointer}
            onPointerUp={(event) => {
              if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
              event.currentTarget.releasePointerCapture(event.pointerId);
            }}
          ><span /></div>
          <PlaygroundInspector />
        </div>
      </section>
    </main>
  );
}