import {
  Ban,
  Clock,
  Code,
  FileText,
  Globe,
  MapPin,
  Pause,
  Plus,
  Reply,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { RuleAction, RuleActionType } from '../../../../shared/desktop-api';
import { ActionCard, type ActionTone } from '../ActionCard/ActionCard';

import { ActionBody } from './ActionBody';
import styles from './ActionEditor.module.css';

interface ActionMeta {
  icon: typeof Code;
  tone: ActionTone;
  titleKey: string;
  subKey: string;
}

const ACTION_META: Record<RuleActionType, ActionMeta> = {
  header: { icon: Code, tone: 'rewrite', titleKey: 'rules.rewrite', subKey: 'rules.header' },
  query: { icon: Code, tone: 'rewrite', titleKey: 'rules.rewrite', subKey: 'rules.query' },
  body: { icon: FileText, tone: 'rewrite', titleKey: 'rules.rewrite', subKey: 'rules.body' },
  status: { icon: Code, tone: 'rewrite', titleKey: 'rules.status', subKey: 'rules.override' },
  synthetic: { icon: Reply, tone: 'block', titleKey: 'rules.synthetic', subKey: 'rules.response' },
  'map-local': { icon: MapPin, tone: 'map', titleKey: 'rules.mapLocal', subKey: 'rules.serveFile' },
  'map-remote': { icon: Globe, tone: 'remote', titleKey: 'rules.mapRemote', subKey: 'rules.reroute' },
  block: { icon: Ban, tone: 'block', titleKey: 'rules.block', subKey: 'rules.resetClose' },
  delay: { icon: Clock, tone: 'flow', titleKey: 'rules.delay', subKey: 'rules.latency' },
  breakpoint: { icon: Pause, tone: 'brk', titleKey: 'rules.breakpoint', subKey: 'rules.pauseEdit' },
};

export interface ActionEditorProps {
  action: RuleAction;
  onChange: (action: RuleAction) => void;
  onRemove: () => void;
}

/** 单个 action 卡片：按类型渲染完整编辑表单；名/值/正文自由输入，操作/相位为枚举。 */
export function ActionEditor({
  action,
  onChange,
  onRemove,
}: ActionEditorProps): React.JSX.Element {
  const { t } = useTranslation();
  const translate = (key: string): string => t(key);
  const meta = ACTION_META[action.type];
  if (!meta) {
    return <span />;
  }
  return (
    <ActionCard icon={meta.icon} tone={meta.tone} title={t(meta.titleKey)} sub={t(meta.subKey)} onRemove={onRemove}>
      <ActionBody action={action} onChange={onChange} translate={translate} />
    </ActionCard>
  );
}
