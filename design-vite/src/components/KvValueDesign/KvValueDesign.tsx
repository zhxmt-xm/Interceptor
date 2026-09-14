import { Copy } from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';

import { IconButton } from '../IconButton/IconButton';
import { splitKvTextLines } from './utils';
import styles from './KvValueDesign.module.css';

interface KvValueDesignProps {
  readonly value: string;
  readonly accent?: 'a' | 'g';
  readonly effect?: { readonly className: string; readonly label: string; readonly link: boolean };
  readonly inactive: boolean;
}

export function KvValueDesign({ value, accent, effect, inactive }: KvValueDesignProps): React.JSX.Element {
  const hostRef = useRef<HTMLSpanElement>(null);
  const [wrapped, setWrapped] = useState<{ value: string; lines: string[] } | null>(null);
  const lines = wrapped?.value === value ? wrapped.lines : [value];

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const reflow = () => {
      const width = host.getBoundingClientRect().width;
      const lastLine = host.lastElementChild;
      if (width === 0 || !lastLine) return;
      const gap = Number.parseFloat(getComputedStyle(lastLine).columnGap);
      const actionsWidth = Array.from(lastLine.children).reduce(
        (total, action) => total + action.getBoundingClientRect().width + gap, 0,
      );
      const measure = document.createElement('span');
      measure.className = styles.kvValueMeasure!;
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
      setWrapped((current) => current?.value === value && current.lines.length === nextLines.length
        && current.lines.every((line, index) => line === nextLines[index]) ? current : { value, lines: nextLines });
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
  }, [value, effect?.className, effect?.label]);

  const label = effect ? (
    <span className={styles.kvRuleContent}><span className={styles.kvRuleLabel}>{effect.label}</span></span>
  ) : null;

  return (
    <span ref={hostRef} className={`v ${styles.kvValueDesign} ${accent === 'a' ? styles.kvValueAccent : accent === 'g' ? styles.kvValueGood : ''}`}>
      {lines.map((line, index) => (
        <span className={`${styles.kvValueLine} ${inactive ? styles.kvValueInactive : ''}`} key={index}>
          {line}{index === lines.length - 1 ? <>
            {effect?.link ? <button type="button" className={effect.className} data-rule-link="">{label}</button>
              : effect ? <span className={effect.className}>{label}</span> : null}
            {value ? <IconButton className={styles.kvValueCopy} size="inline" label="Copy"
              icon={<Copy aria-hidden="true" />} onClick={() => void navigator.clipboard.writeText(value)} /> : null}
          </> : null}
        </span>
      ))}
    </span>
  );
}