import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

import { cx } from '../../../components';
import type { KvTextSegment } from '../utils';

import { requestKvLineMeasurement } from './kvLineMeasurement';
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
  // 最近一次已渲染的测量输入（原文/可用宽度/动作宽度）；输入没变就不必再强制布局。
  const measuredKeyRef = useRef<string | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;
  const segmentsRef = useRef<{ value: string; segments: readonly KvTextSegment[] } | null>(null);
  const segmentsFor = (text: string): readonly KvTextSegment[] => {
    const cached = segmentsRef.current;
    if (cached?.value === text) {
      return cached.segments;
    }
    const segments = [
      ...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text),
    ];
    segmentsRef.current = { value: text, segments };
    return segments;
  };
  const scheduleRef = useRef<() => void>(() => {});
  scheduleRef.current = () => {
    const host = hostRef.current;
    const nextValue = valueRef.current;
    if (!host || typeof nextValue !== 'string') {
      return;
    }
    requestKvLineMeasurement({
      host,
      value: nextValue,
      isCurrent: (key) => measuredKeyRef.current === key,
      segments: () => segmentsFor(nextValue),
      resolve: ({ key, lines }) => {
        measuredKeyRef.current = key;
        const resolvedValue = valueRef.current;
        if (typeof resolvedValue !== 'string') {
          return;
        }
        setWrapped((current) => current?.value === resolvedValue
          && current.lines.length === lines.length
          && current.lines.every((line, index) => line === lines[index])
          ? current
          : { value: resolvedValue, lines });
      },
    });
  };
  const lines = typeof value === 'string'
    ? wrapped?.value === value ? wrapped.lines : [value]
    : null;

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }
    const schedule = (): void => scheduleRef.current();
    // 字体加载会改变换行位置，但几何尺寸不变；清掉 key 强制重算一次。
    const reload = (): void => {
      measuredKeyRef.current = null;
      scheduleRef.current();
    };
    schedule();
    const observer = new ResizeObserver(schedule);
    observer.observe(host);
    const lastLine = host.lastElementChild;
    for (const action of lastLine?.children ?? []) {
      observer.observe(action);
    }
    document.fonts.addEventListener('loadingdone', reload);
    return () => {
      observer.disconnect();
      document.fonts.removeEventListener('loadingdone', reload);
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
