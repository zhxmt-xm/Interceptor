import type { AutomationId } from '../../../../shared/automation-ids';
import type { KvRow } from '../interfaces';

import { Kv } from './Kv';
import styles from './KvSection.module.css';
import { Section } from './Section';

export interface KvSectionProps {
  title: string;
  automationId?: AutomationId;
  rows: KvRow[];
  /** 不给空态文案时无数据就整段隐藏。 */
  empty?: string;
  onOpenRule?: (ruleId: string) => void;
}

/** Request/Response 共用的 KV 区块；不给空态文案时无数据就隐藏整段。 */
export function KvSection({
  title,
  automationId,
  rows,
  empty,
  onOpenRule,
}: KvSectionProps): React.JSX.Element | null {
  if (rows.length === 0 && !empty) {
    return null;
  }
  return (
    <Section title={title} automationId={automationId} count={rows.length}>
      {rows.length ? (
        <Kv rows={rows} onOpenRule={onOpenRule} />
      ) : (
        <div className={styles.empty}>{empty}</div>
      )}
    </Section>
  );
}
