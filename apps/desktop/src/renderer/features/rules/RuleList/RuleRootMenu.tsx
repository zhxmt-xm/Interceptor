import { Download, FolderPlus, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
import { TreeContextMenu, type TreeMenuItem } from '../../../components';
import { useRulesStore } from '../data/rulesStore';
import { exportRules } from '../data/useRulesData';

interface RuleRootMenuProps {
  readonly children: React.ReactElement;
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
}

export function RuleRootMenu({
  children,
  onOpenChange,
  open,
}: RuleRootMenuProps): React.JSX.Element {
  const { t } = useTranslation();
  const nodes = useRulesStore((state) => state.nodes);
  const addRule = useRulesStore((state) => state.addRule);
  const addFolder = useRulesStore((state) => state.addFolder);
  const items: TreeMenuItem[] = [
    {
      key: 'new-rule',
      icon: Plus,
      label: t('rules.newRule'),
      automationId: AUTOMATION_IDS.rules.create,
      onSelect: () => addRule(t('rules.newRuleName'), null),
    },
    {
      key: 'new-folder',
      icon: FolderPlus,
      label: t('rules.newFolder'),
      automationId: AUTOMATION_IDS.rules.createFolder,
      onSelect: () => addFolder(t('rules.newFolderName'), null),
    },
    {
      key: 'export',
      icon: Download,
      label: t('rules.exportRules'),
      disabled: nodes.length === 0,
      automationId: AUTOMATION_IDS.rules.exportRules,
      onSelect: () => {
        void exportRules(t('rules.exportRules'));
      },
    },
  ];

  return (
    <TreeContextMenu items={items} open={open} onOpenChange={onOpenChange}>
      {children}
    </TreeContextMenu>
  );
}