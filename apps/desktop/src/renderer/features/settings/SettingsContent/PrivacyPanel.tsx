import { useTranslation } from 'react-i18next';

import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
import { StatusBadge, Switch } from '../../../components';
import { usePrivacyStore } from '../data/privacyStore';

import styles from './PrivacyPanel.module.css';
import { SettingsGroup as Group } from './SettingsGroup';
import { SettingsRow as Row } from './SettingsRow';

/** The Privacy settings section: recording-safety facts and export redaction defaults. */
export function PrivacyPanel(): React.JSX.Element {
  const { t } = useTranslation();
  const maskAuthorization = usePrivacyStore((state) => state.maskAuthorization);
  const maskCookies = usePrivacyStore((state) => state.maskCookies);
  const warnBeforeUnmasked = usePrivacyStore((state) => state.warnBeforeUnmasked);
  const setPreference = usePrivacyStore((state) => state.setPreference);
  return (
    <>
      <h2 className={styles.title}>{t('settings.privacy')}</h2>
      <div className={styles.desc}>
        {t('settings.privacyDescription')}
      </div>
      <Group title={t('settings.recordingSafety')}>
        <Row
          label={t('settings.captureOnLaunch')}
          hint={t('settings.captureOnLaunchHint')}
        >
          <StatusBadge tone="green">{t('settings.offByDefault')}</StatusBadge>
        </Row>
        <Row
          label={t('settings.listenerBinding')}
          hint={t('settings.listenerBindingHint')}
        >
          <StatusBadge tone="green">{t('settings.loopbackOnly')}</StatusBadge>
        </Row>
        <Row
          label={t('settings.telemetry')}
          hint={t('settings.telemetryHint')}
        >
          <StatusBadge tone="green">{t('settings.disabled')}</StatusBadge>
        </Row>
      </Group>
      <Group title={t('settings.exportDefaults')}>
        <Row
          label={t('settings.maskAuthorization')}
          hint={t('settings.maskAuthorizationHint')}
        >
          <Switch
            checked={maskAuthorization}
            automationId={AUTOMATION_IDS.settings.privacy.maskAuthorization}
            onChange={(value) => setPreference('maskAuthorization', value)}
          />
        </Row>
        <Row
          label={t('settings.maskCookies')}
          hint={t('settings.maskCookiesHint')}
        >
          <Switch
            checked={maskCookies}
            automationId={AUTOMATION_IDS.settings.privacy.maskCookies}
            onChange={(value) => setPreference('maskCookies', value)}
          />
        </Row>
        <Row
          label={t('settings.warnUnmasked')}
          hint={t('settings.warnUnmaskedHint')}
        >
          <Switch
            checked={warnBeforeUnmasked}
            automationId={AUTOMATION_IDS.settings.privacy.warnUnmasked}
            onChange={(value) => setPreference('warnBeforeUnmasked', value)}
          />
        </Row>
      </Group>
    </>
  );
}
