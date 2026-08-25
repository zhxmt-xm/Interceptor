import { ArrowRight } from 'lucide-react';
import type { ReactNode } from 'react';

import styles from './PauseBanner.module.css';

interface PauseBannerProps {
  readonly actions?: ReactNode;
  readonly phase: string;
  readonly received?: boolean;
  readonly rule: string;
}

export function PauseBanner({
  actions,
  phase,
  received,
  rule,
}: PauseBannerProps): React.JSX.Element {
  return (
    <div className={styles.pauseBanner} data-breakpoint-component="context">
      <span className={styles.pauseBannerPhase}>
        <ArrowRight aria-hidden="true" data-received={received || undefined} size={12} />
        {phase}
      </span>
      <span className={styles.pauseBannerRule}>{rule}</span>
      {actions ? <span className={styles.pauseBannerActions}>{actions}</span> : null}
    </div>
  );
}