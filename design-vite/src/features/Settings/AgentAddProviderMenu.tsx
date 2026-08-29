import { Dropdown, type MenuProps } from 'antd';
import { Plus } from 'lucide-react';
import type { ReactNode } from 'react';

import { fixtureClassNames } from '../../fixtures/FixtureRenderer';
import { useDesignState } from '../../state/useDesignState';
import { ProviderLogo } from '../Agent/ProviderLogo';
import styles from './AgentAddProviderMenu.module.css';

interface AgentAddProviderMenuProps {
  readonly children?: ReactNode;
}

export function AgentAddProviderMenu({ children }: AgentAddProviderMenuProps): React.JSX.Element {
  const { updateState } = useDesignState();
  const items: MenuProps['items'] = [
    {
      key: 'deepseek',
      icon: <ProviderLogo active brand="deepseek" />,
      label: 'DeepSeek',
    },
    {
      key: 'custom',
      icon: <ProviderLogo brand="unknown" />,
      label: 'OpenAI-compatible',
    },
  ];

  return (
    <Dropdown
      autoAdjustOverflow
      destroyOnHidden
      placement="bottomRight"
      trigger={['click']}
      menu={{
        'aria-label': 'Provider types',
        items,
        selectable: false,
        onClick: ({ key }) => updateState({
          agentProviderDialog: key === 'deepseek' ? 'deepseek' : 'custom',
          agentProviderDialogMode: 'add',
          agentProviderDialogTarget: key === 'deepseek' ? 'deepseek' : '',
        }),
      }}
      classNames={{ root: styles.menu }}
    >
      {children ?? (
        <button className={fixtureClassNames('btn sm')} type="button">
          <Plus aria-hidden="true" />
          Add provider
        </button>
      )}
    </Dropdown>
  );
}
