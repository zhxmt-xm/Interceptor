import { useTranslation } from 'react-i18next';

import { SECTIONS } from '../constants';

import { AppContainerPanel } from './AppContainerPanel';
import { CertificatesPanel } from './CertificatesPanel';
import { PlaceholderPanel } from './PlaceholderPanel';
import { PrivacyPanel } from './PrivacyPanel';
import { ProxyPanel } from './ProxyPanel';
import styles from './SettingsContent.module.css';
import { StoragePanel } from './StoragePanel';
import { TlsPassthroughPanel } from './TlsPassthroughPanel';
import { UpdatesPanel } from './UpdatesPanel';

export interface SettingsContentProps {
  active: string;
}

/** 有专属面板的分区；其余分区落到占位面板。 */
const PANELS: Record<string, () => React.JSX.Element> = {
  proxy: ProxyPanel,
  'app-containers': AppContainerPanel,
  'tls-passthrough': TlsPassthroughPanel,
  certificates: CertificatesPanel,
  storage: StoragePanel,
  privacy: PrivacyPanel,
  updates: UpdatesPanel,
};

/** Right settings pane: renders the panel for the active section. */
export function SettingsContent({
  active,
}: SettingsContentProps): React.JSX.Element {
  const { t } = useTranslation();
  const Panel = PANELS[active];
  const labelKey = SECTIONS.find((section) => section.id === active)?.labelKey;

  return (
    <div className={styles.content}>
      {Panel ? (
        <Panel />
      ) : (
        <PlaceholderPanel label={t(labelKey ?? 'settings.title')} />
      )}
    </div>
  );
}
