import { useRef, useState } from 'react';

import { Splitter } from '../../../components';
import { RequestBuilder } from '../RequestBuilder/RequestBuilder';
import { ResponsePanel } from '../ResponsePanel/ResponsePanel';
import styles from './ComposerMain.module.css';

/** Composer body: request builder, draggable splitter and response panel. */
export function ComposerMain(): React.JSX.Element {
  const [responseWidth, setResponseWidth] = useState(540);
  const mainRef = useRef<HTMLDivElement>(null);

  const startDrag = (event: React.PointerEvent): void => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = responseWidth;
    const total = mainRef.current?.clientWidth ?? 1200;
    const onMove = (move: PointerEvent): void => {
      const next = startWidth - (move.clientX - startX);
      setResponseWidth(Math.min(Math.max(next, 380), Math.max(440, total - 440)));
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
      style={{ gridTemplateColumns: `minmax(0, 1fr) 7px ${responseWidth}px` }}
    >
      <RequestBuilder />
      <Splitter onPointerDown={startDrag} />
      <ResponsePanel />
    </div>
  );
}
