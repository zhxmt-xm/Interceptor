import { Dropdown, type MenuProps } from 'antd';
import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '../../../components/Button/Button';
import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
import { ProviderLogo } from '../../agent/ProviderLogo/ProviderLogo';
import styles from './AgentAddProviderMenu.module.css';

interface AgentAddProviderMenuProps {
  readonly disabled?: boolean;
  readonly onAddCustom: () => void;
  readonly onAddDeepSeek: () => void;
}

/** Chooses one explicit Provider type before opening a configuration draft. */
export function AgentAddProviderMenu({
  disabled = false,
  onAddCustom,
  onAddDeepSeek,
}: AgentAddProviderMenuProps): React.JSX.Element {
  const { t } = useTranslation();
  const items: MenuProps['items'] = [
    {
      key: 'deepseek',
      icon: <ProviderLogo active brand="deepseek" />,
      label: (
        <span data-automation-id={AUTOMATION_IDS.agent.models.addDeepSeek}>
          DeepSeek
        </span>
      ),
    },
    {
      key: 'openai-compatible',
      icon: <ProviderLogo brand="unknown" />,
      label: (
        <span data-automation-id={AUTOMATION_IDS.agent.models.addCustom}>
          {t('settings.agent.customProvider')}
        </span>
      ),
    },
  ];

  return (
    <Dropdown
      autoAdjustOverflow
      destroyOnHidden
      disabled={disabled}
      placement="bottomRight"
      trigger={['click']}
      menu={{
        'aria-label': t('settings.agent.providerTypes'),
        items,
        selectable: false,
        onClick: ({ key }) => {
          if (key === 'deepseek') {
            onAddDeepSeek();
          } else {
            onAddCustom();
          }
        },
      }}
      classNames={{ root: styles.menu }}
    >
      <span>
        <Button
          automationId={AUTOMATION_IDS.agent.models.add}
          disabled={disabled}
          icon={Plus}
          size="sm"
        >
          {t('settings.agent.addProvider')}
        </Button>
      </span>
    </Dropdown>
  );
}
