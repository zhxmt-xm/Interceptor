import { Menu } from 'lucide-react';

import { IconButton, Title } from '../../../components';

export interface SettingsTopbarProps {
  onMenu?: () => void;
}

/** Settings topbar: sidebar toggle and title. */
export function SettingsTopbar({ onMenu }: SettingsTopbarProps): React.JSX.Element {
  return (
    <>
      <IconButton icon={Menu} label="Toggle sidebar" onClick={onMenu} />
      <Title>Settings</Title>
    </>
  );
}
