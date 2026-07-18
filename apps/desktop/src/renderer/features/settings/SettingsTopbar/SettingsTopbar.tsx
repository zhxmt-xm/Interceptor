import { Menu } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { IconButton, Title } from '../../../components';

export interface SettingsTopbarProps {
  onMenu?: () => void;
}

/** Settings topbar: sidebar toggle and title. */
export function SettingsTopbar({ onMenu }: SettingsTopbarProps): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <>
      <IconButton icon={Menu} label={t('capture.toggleSidebar')} onClick={onMenu} />
      <Title>{t('settings.title')}</Title>
    </>
  );
}
