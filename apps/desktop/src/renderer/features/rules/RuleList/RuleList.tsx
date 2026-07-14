import { MoreHorizontal, Search } from 'lucide-react';

import { Count, IconButton } from '../../../components';
import { RULES } from '../data';
import { RuleRow } from '../RuleRow/RuleRow';
import styles from './RuleList.module.css';

export interface RuleListProps {
  selected: number;
  onSelect: (index: number) => void;
}

/** Ordered, toggleable list of rules. */
export function RuleList({ selected, onSelect }: RuleListProps): React.JSX.Element {
  return (
    <div className={styles.list}>
      <div className={styles.bar}>
        <Count className={styles.grow}>
          <b>Rev 42</b> · applied
        </Count>
        <IconButton icon={Search} label="Search rules" size="sm" />
        <IconButton icon={MoreHorizontal} label="More" size="sm" />
      </div>

      {RULES.map((rule, index) => (
        <RuleRow
          key={index}
          rule={rule}
          selected={index === selected}
          onSelect={() => onSelect(index)}
        />
      ))}
    </div>
  );
}
