import { forwardRef } from 'react';
import type { LucideProps } from 'lucide-react';
import { siAndroid } from 'simple-icons';

import styles from './AndroidMark.module.css';

export const AndroidMark = forwardRef<SVGSVGElement, LucideProps>(function AndroidMark(
  { size = 24, className, width, height, ...properties }, ref,
) {
  return (
    <svg {...properties} ref={ref} className={`${styles.androidMark} ${className ?? ''}`}
      width={width ?? size} height={height ?? size} viewBox="0 0 24 24" fill={`#${siAndroid.hex}`} stroke="none">
      <path d={siAndroid.path} />
    </svg>
  );
});
