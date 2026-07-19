import { Check, Menu, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Count, IconButton, Title } from '../../../components';
import { enabledCount, useRulesStore } from '../rulesStore';
import { applyRules } from '../useRulesData';
import styles from './RulesTopbar.module.css';

export interface RulesTopbarProps {
  onMenu?: () => void;
}

/** Rules topbar: sidebar toggle, title, rule count and apply/new actions. */
export function RulesTopbar({ onMenu }: RulesTopbarProps): React.JSX.Element {
  const { t } = useTranslation();
  const rules = useRulesStore((state) => state.rules);
  const dirty = useRulesStore((state) => state.dirty);
  const saving = useRulesStore((state) => state.saving);
  const addRule = useRulesStore((state) => state.addRule);
  const enabled = enabledCount(rules);

  return (
    <>
      <IconButton icon={Menu} label={t('capture.toggleSidebar')} onClick={onMenu} />
      <Title>{t('rules.title')}</Title>
      <Count className={styles.count}>
        {t('rules.summary', { count: rules.length, enabled })}
      </Count>
      <div className={styles.actions}>
        <IconButton
          icon={Plus}
          label={t('rules.newRule')}
          size="sm"
          onClick={() => addRule(t('rules.newRuleName'))}
        />
        <IconButton
          icon={Check}
          label={saving ? t('rules.applying') : t('rules.applyChanges')}
          size="sm"
          strokeWidth={2.4}
          disabled={!dirty || saving}
          onClick={() => void applyRules()}
        />
      </div>
    </>
  );
}
