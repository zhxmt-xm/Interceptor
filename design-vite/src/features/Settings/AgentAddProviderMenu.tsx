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
      icon: <span className={styles.providerOptionIcon}><ProviderLogo active brand="deepseek" /></span>,
      label: <span className={styles.providerOptionLabel}>DeepSeek</span>,
    },
    {
      key: 'custom',
      icon: <span className={styles.providerOptionIcon}><ProviderLogo brand="unknown" /></span>,
      label: <span className={styles.providerOptionLabel}>OpenAI-compatible</span>,
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
      styles={{
        item: {
          minHeight: 32,
          marginBlock: 0,
          marginInline: 0,
          padding: '0 8px',
          borderRadius: 6,
          fontSize: 12,
        },
        itemContent: { fontSize: 12, fontWeight: 500, lineHeight: '18px' },
      }}
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
