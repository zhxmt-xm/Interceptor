import { Check, Menu, Plus } from 'lucide-react';

import { Button, Count, IconButton, Title } from '../../../components';
import { enabledCount, useRulesStore } from '../rulesStore';
import { applyRules } from '../useRulesData';
import styles from './RulesTopbar.module.css';

export interface RulesTopbarProps {
  onMenu?: () => void;
}

/** Rules topbar: sidebar toggle, title, rule count and apply/new actions. */
export function RulesTopbar({ onMenu }: RulesTopbarProps): React.JSX.Element {
  const rules = useRulesStore((state) => state.rules);
  const dirty = useRulesStore((state) => state.dirty);
  const saving = useRulesStore((state) => state.saving);
  const addRule = useRulesStore((state) => state.addRule);
  const enabled = enabledCount(rules);

  return (
    <>
      <IconButton icon={Menu} label="Toggle sidebar" onClick={onMenu} />
      <Title>Rules</Title>
      <Count className={styles.count}>
        <b>{rules.length}</b> rule{rules.length === 1 ? '' : 's'} · {enabled} enabled
      </Count>
      <div className={styles.actions}>
        <Button icon={Plus} onClick={addRule}>
          New rule
        </Button>
        <Button
          icon={Check}
          variant="primary"
          iconStrokeWidth={2.4}
          disabled={!dirty || saving}
          onClick={() => void applyRules()}
        >
          {saving ? 'Applying…' : 'Apply changes'}
        </Button>
      </div>
    </>
  );
}
