import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

import { cx } from '../../../components';
import { splitKvTextLines } from '../utils';
import styles from './KvValue.module.css';

interface KvValueProps {
  value: ReactNode;
  accent?: 'a' | 'g';
  inactive: boolean;
  children: ReactNode;
}

export function KvValue({ value, accent, inactive, children }: KvValueProps): React.JSX.Element {
  const hostRef = useRef<HTMLSpanElement>(null);
  const [wrapped, setWrapped] = useState<{ value: string; lines: string[] } | null>(null);
  const lines = typeof value === 'string' ? wrapped?.value === value ? wrapped.lines : [value] : null;

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host || typeof value !== 'string') return;
    const reflow = () => {
      const width = host.getBoundingClientRect().width;
      const lastLine = host.lastElementChild;
      if (width === 0 || !lastLine) return;
      const gap = Number.parseFloat(getComputedStyle(lastLine).columnGap);
      const actionsWidth = Array.from(lastLine.children).reduce(
        (total, action) => total + action.getBoundingClientRect().width + gap, 0,
      );
      const measure = document.createElement('span');
      measure.className = styles.measure!;
      measure.setAttribute('aria-hidden', 'true');
      measure.textContent = value;
      measure.style.width = `${Math.max(0, width - actionsWidth)}px`;
      host.append(measure);
      let nextLines: string[];
      try {
        const range = document.createRange();
        nextLines = splitKvTextLines(value, (start, end) => {
          range.setStart(measure.firstChild!, start);
          range.setEnd(measure.firstChild!, end);
          return range.getBoundingClientRect().top;
        });
      } finally {
        measure.remove();
      }
      setWrapped((current) => current?.value === value
        && current.lines.length === nextLines.length
        && current.lines.every((line, index) => line === nextLines[index])
        ? current : { value, lines: nextLines });
    };
    reflow();
    const observer = new ResizeObserver(reflow);
    observer.observe(host);
    for (const action of host.lastElementChild?.children ?? []) observer.observe(action);
    document.fonts.addEventListener('loadingdone', reflow);
    return () => {
      observer.disconnect();
      document.fonts.removeEventListener('loadingdone', reflow);
    };
  }, [value, children]);

  return (
    <span ref={hostRef} className={cx(styles.value, !lines && styles.composite,
      accent === 'a' && styles.accent, accent === 'g' && styles.good)}>
      {lines ? lines.map((line, index) => (
        <span className={cx(styles.line, inactive && styles.inactive)} key={index}>
          {line}{index === lines.length - 1 ? children : null}
        </span>
      )) : <><span className={cx(styles.text, inactive && styles.inactive)}>{value}</span>{children}</>}
    </span>
  );
}