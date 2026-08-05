import { useRef, useState } from 'react';

import { Splitter } from '../../../components';
import { RuleEditor } from '../RuleEditor/RuleEditor';
import { RuleList } from '../RuleList/RuleList';
import styles from './RulesMain.module.css';

export interface RulesMainProps {
  onShowRuleRequests: (ruleId: string) => void;
}

/** Rules workspace body: rule list, draggable splitter and rule editor. */
export function RulesMain({ onShowRuleRequests }: RulesMainProps): React.JSX.Element {
  const [listWidth, setListWidth] = useState(432);
  const mainRef = useRef<HTMLDivElement>(null);

  const startListDrag = (event: React.PointerEvent): void => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = listWidth;
    const total = mainRef.current?.clientWidth ?? 1200;
    const onMove = (move: PointerEvent): void => {
      const next = startWidth + (move.clientX - startX);
      setListWidth(Math.min(Math.max(next, 320), Math.max(360, total - 420)));
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
      style={{ gridTemplateColumns: `${listWidth}px 1px minmax(0, 1fr)` }}
    >
      <RuleList onShowRuleRequests={onShowRuleRequests} />
      <Splitter onPointerDown={startListDrag} />
      <RuleEditor onShowRuleRequests={onShowRuleRequests} />
    </div>
  );
}
