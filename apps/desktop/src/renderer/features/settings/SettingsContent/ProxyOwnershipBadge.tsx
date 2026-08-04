import { useTranslation } from 'react-i18next';

import { StatusBadge } from '../../../components';
import type { SystemProxyStatus } from '../../../../shared/desktop-api';
import { proxyTitleStatus } from '../utils';

export interface ProxyOwnershipBadgeProps {
  status: SystemProxyStatus;
}

/** Ownership-specific status badge for normal, conflict and unsupported states. */
export function ProxyOwnershipBadge({
  status,
}: ProxyOwnershipBadgeProps): React.JSX.Element {
  const { t } = useTranslation();
  const value = proxyTitleStatus(status);
  return (
    <StatusBadge tone={value.tone}>
      {status.owned ? t('settings.ownedByInterceptor') : t(value.labelKey)}
    </StatusBadge>
  );
}
