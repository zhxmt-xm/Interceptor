import { cx } from '../../../components';
import type { AutomationId } from '../../../../shared/automation-ids';
import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
import { useTranslation } from 'react-i18next';
import { SECTIONS } from '../constants';
import styles from './SettingsNav.module.css';

const AUTOMATION_ID_BY_SECTION: Record<string, AutomationId> = {
  proxy: AUTOMATION_IDS.settings.section.proxy,
  upstream: AUTOMATION_IDS.settings.section.upstream,
  'app-containers': AUTOMATION_IDS.settings.section.appContainers,
  'tls-passthrough': AUTOMATION_IDS.settings.section.tlsPassthrough,
  certificates: AUTOMATION_IDS.settings.section.certificates,
  appearance: AUTOMATION_IDS.settings.section.appearance,
  storage: AUTOMATION_IDS.settings.section.storage,
  privacy: AUTOMATION_IDS.settings.section.privacy,
  agent: AUTOMATION_IDS.settings.section.agent,
  updates: AUTOMATION_IDS.settings.section.updates,
};

export interface SettingsNavProps {
  active: string;
  onSelect: (id: string) => void;
}

/** Left settings rail: the section list. */
export function SettingsNav({
  active,
  onSelect,
}: SettingsNavProps): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div className={styles.nav}>
      {SECTIONS.map(({ id, labelKey, Icon }) => (
        <button
          type="button"
          key={id}
          className={cx(styles.item, id === active && styles.active)}
          data-automation-id={AUTOMATION_ID_BY_SECTION[id]}
          aria-current={id === active ? 'page' : undefined}
          onClick={() => onSelect(id)}
        >
          <Icon size={16} strokeWidth={1.9} />
          {t(labelKey)}
        </button>
      ))}
    </div>
  );
}
