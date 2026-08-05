import type { RuleDefinition } from '@interceptor/core-protocol';
import { Funnel, Pencil, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { AutomationIdFactory } from '../../../../shared/automation-ids';
import { TreeContextMenu, type TreeMenuItem } from '../../../components';
import { useRulesStore } from '../data/rulesStore';

export interface RuleRowMenuProps {
  rule: RuleDefinition;
  /** 命中数为 0 时禁用「显示匹配请求」。 */
  hits: number;
  onShowRuleRequests: (ruleId: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactElement;
}

/** 规则行的右键菜单：改名、跳到命中的请求、删除。 */
export function RuleRowMenu({
  rule,
  hits,
  onShowRuleRequests,
  open,
  onOpenChange,
  children,
}: RuleRowMenuProps): React.JSX.Element {
  const { t } = useTranslation();
  const beginRename = useRulesStore((state) => state.beginRename);
  const removeNode = useRulesStore((state) => state.removeNode);

  const items: TreeMenuItem[] = [
    {
      key: 'rename',
      icon: Pencil,
      label: t('rules.renameRule'),
      automationId: AutomationIdFactory.ruleNodeAction(rule.id, 'rename'),
      onSelect: () => beginRename(rule.id),
    },
    {
      key: 'show-requests',
      icon: Funnel,
      label: t('rules.showMatchingRequests'),
      disabled: hits === 0,
      automationId: AutomationIdFactory.ruleNodeAction(rule.id, 'show-requests'),
      onSelect: () => onShowRuleRequests(rule.id),
    },
    {
      key: 'delete',
      icon: Trash2,
      label: t('rules.deleteRule'),
      danger: true,
      automationId: AutomationIdFactory.ruleNodeAction(rule.id, 'delete'),
      onSelect: () => removeNode(rule.id),
    },
  ];

  return (
    <TreeContextMenu items={items} open={open} onOpenChange={onOpenChange}>
      {children}
    </TreeContextMenu>
  );
}
