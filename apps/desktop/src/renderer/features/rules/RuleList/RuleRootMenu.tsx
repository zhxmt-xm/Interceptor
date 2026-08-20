import { Download, FolderPlus, Plus, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
import { TreeContextMenu, type TreeMenuItem } from '../../../components';
import { useRulesStore } from '../data/rulesStore';

interface RuleRootMenuProps {
  readonly children: React.ReactElement;
  readonly onOpenChange: (open: boolean) => void;
  readonly onImport: () => void;
  readonly onExport: () => void;
  readonly open: boolean;
}

export function RuleRootMenu({
  children,
  onOpenChange,
  onImport,
  onExport,
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
      key: 'import',
      icon: Upload,
      label: t('rules.importRules'),
      automationId: AUTOMATION_IDS.rules.importRules,
      onSelect: onImport,
    },
    {
      key: 'export',
      icon: Download,
      label: t('rules.exportRules'),
      disabled: nodes.length === 0,
      automationId: AUTOMATION_IDS.rules.exportRules,
      onSelect: onExport,
    },
  ];

  return (
    <TreeContextMenu items={items} open={open} onOpenChange={onOpenChange}>
      {children}
    </TreeContextMenu>
  );
}