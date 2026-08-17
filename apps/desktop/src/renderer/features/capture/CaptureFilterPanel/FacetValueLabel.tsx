import { AppWindow, Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { findLeaf } from '@interceptor/core-protocol';

import { MethodBadge } from '../../../components';
import { useRulesStore } from '../../rules/data/rulesStore';
import { PENDING_FACET_VALUE, UNKNOWN_FACET_VALUE } from '../constants';
import { useCaptureStore } from '../data/captureStore';
import type { CaptureFacetId } from '../interfaces';

import styles from './FacetValueLabel.module.css';
import { StatusFacetValue } from './StatusFacetValue';

export interface FacetValueLabelProps {
  facet: CaptureFacetId;
  value: string;
}

/** 一个 facet 取值的展示形态：应用带图标、方法带徽标、状态带语义色点。 */
export function FacetValueLabel({
  facet,
  value,
}: FacetValueLabelProps): React.JSX.Element {
  const { t } = useTranslation();
  const icon = useCaptureStore((state) =>
    facet === 'application' ? state.clientAppIcons.get(value) : undefined);
  const appName = useCaptureStore((state) =>
    facet === 'application'
      ? state.rows.find((row) => row.appId === value)?.appName
      : undefined);
  const ruleName = useRulesStore((state) =>
    facet === 'rule' ? (findLeaf(state.nodes, value)?.name ?? undefined) : undefined);

  if (facet === 'application') {
    return (
      <>
        {icon ? (
          <img className={styles.itemAppIcon} src={icon} alt="" />
        ) : (
          <AppWindow className={styles.itemAppUnknown} size={13} strokeWidth={1.8} />
        )}
        <span className={styles.itemName}>
          {value === PENDING_FACET_VALUE
            ? t('capture.statusPending')
            : value === UNKNOWN_FACET_VALUE
              ? t('capture.unknownApplication')
              : appName ?? value}
        </span>
      </>
    );
  }
  if (facet === 'method') {
    return <MethodBadge method={value} />;
  }
  if (facet === 'host') {
    return (
      <>
        <Lock className={styles.itemLock} size={13} strokeWidth={2.2} />
        <span className={styles.itemName}>{value}</span>
      </>
    );
  }
  if (facet === 'status') {
    return <StatusFacetValue value={value} />;
  }
  if (facet === 'protocol') {
    return <span className={styles.itemProtocol}>{value}</span>;
  }
  if (facet === 'rule') {
    return <span className={styles.itemName}>{ruleName ?? value}</span>;
  }
  if (value === PENDING_FACET_VALUE) {
    return <span className={styles.itemName}>{t('capture.statusPending')}</span>;
  }
  return <span className={styles.itemName}>{value}</span>;
}
