import { useVirtualizer } from '@tanstack/react-virtual';
import { useEffect, useRef, useState } from 'react';

import { hexLine, hexLineCount } from '../bodyText';
import styles from './HexView.module.css';

const LINE_HEIGHT = 20;
/** `offset␠␠` + 每字节 `xx␠` + `␠␠` + 每字节一个 ASCII 字符。 */
const FIXED_COLUMNS = 12;
const COLUMNS_PER_BYTE = 4;

interface HexViewProps {
  bytes: Uint8Array;
  parityId?: string;
}

/** 逐行虚拟化的 hex dump：整份 dump 从不进入 DOM，字节数按容器宽度重排。 */
export function HexView({ bytes, parityId }: HexViewProps): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);
  const probeRef = useRef<HTMLSpanElement>(null);
  const [bytesPerLine, setBytesPerLine] = useState(16);

  useEffect(() => {
    const host = hostRef.current;
    const probe = probeRef.current;
    if (!host || !probe) {
      return;
    }
    const measure = (): void => {
      const characterWidth = probe.getBoundingClientRect().width;
      if (characterWidth <= 0) {
        return;
      }
      const columns = host.clientWidth / characterWidth;
      setBytesPerLine(Math.max(4, Math.floor((columns - FIXED_COLUMNS) / COLUMNS_PER_BYTE)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  const count = hexLineCount(bytes.byteLength, bytesPerLine);
  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => hostRef.current,
    estimateSize: () => LINE_HEIGHT,
    overscan: 16,
  });

  return (
    <div ref={hostRef} className={styles.host} data-parity={parityId}>
      <span ref={probeRef} className={styles.probe} aria-hidden="true" />
      <div className={styles.rows} style={{ height: `${virtualizer.getTotalSize()}px` }}>
        {virtualizer.getVirtualItems().map((row) => (
          <div
            key={row.key}
            className={styles.line}
            style={{ transform: `translateY(${row.start}px)` }}
          >
            {hexLine(bytes, row.index, bytesPerLine)}
          </div>
        ))}
      </div>
    </div>
  );
}
