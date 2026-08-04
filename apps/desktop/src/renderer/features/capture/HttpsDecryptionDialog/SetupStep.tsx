import { Check } from 'lucide-react';
import type { ReactNode } from 'react';

import { cx } from '../../../components';

import styles from './SetupStep.module.css';

export interface SetupStepProps {
  number: number;
  done: boolean;
  /** 前置步骤未完成时整行弱化。 */
  pending?: boolean;
  title: string;
  description: string;
  children: ReactNode;
}

/** One stateful row in the HTTPS setup checklist. */
export function SetupStep({
  number,
  done,
  pending = false,
  title,
  description,
  children,
}: SetupStepProps): React.JSX.Element {
  return (
    <div className={cx(styles.step, pending && styles.pending)}>
      <span className={cx(styles.number, done && styles.done)}>
        {done ? <Check aria-hidden="true" /> : number}
      </span>
      <span className={styles.copy}>
        <b>{title}</b>
        <span>{description}</span>
      </span>
      {children}
    </div>
  );
}
