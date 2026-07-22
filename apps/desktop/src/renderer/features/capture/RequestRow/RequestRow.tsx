import { Lock } from 'lucide-react';
import { memo, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';

import type { CaptureExchangeSummary } from '../../../../shared/desktop-api';
import { AutomationIdFactory } from '../../../../shared/automation-ids';
import { cx, MethodBadge } from '../../../components';
import { useCaptureStore } from '../data/captureStore';
import {
  displayBytes,
  displayPath,
  protocolLabel,
  sizeLabel,
  statusKind,
  statusLabel,
  timeLabel,
  typeLabel,
} from '../utils';
import styles from './RequestRow.module.css';

export interface RequestRowProps {
  summary: CaptureExchangeSummary;
  selected: boolean;
  /** 虚拟化定位偏移（像素）；由父列表的 virtualizer 提供。 */
  offsetTop: number;
  onSelect: (id: string) => void;
}

/** 虚拟化列表的行组件：memo 化，实时数据更新时仅内容/位置变化的行才 re-render。 */
export const RequestRow = memo(function RequestRow({
  summary,
  selected,
  offsetTop,
  onSelect,
}: RequestRowProps): React.JSX.Element {
  const { i18n, t } = useTranslation();
  const kind = statusKind(summary.statusCode);
  const isTlsTunnel = protocolLabel(summary.protocol) === 'tls';
  const showQueryParams = useCaptureStore((state) => state.showQueryParams);
  const timeLabels = {
    closed: t('capture.closed'),
    open: t('capture.open'),
    failed: t('capture.failed'),
  };
  const style: CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    transform: `translateY(${offsetTop}px)`,
  };
  return (
    <button
      type="button"
      className={cx(styles.row, selected && styles.selected)}
      onClick={() => onSelect(summary.id)}
      style={style}
      data-automation-id={AutomationIdFactory.captureRequestRow(summary.id)}
    >
      <MethodBadge method={summary.method} />
      <span className={styles.host}>
        <span className={styles.hostName}>
          {summary.secure ? <Lock size={12} strokeWidth={2.2} /> : null}
          {summary.host ?? '—'}
        </span>
        <span className={styles.hostPath}>
          {isTlsTunnel ? t('capture.httpsEncrypted') : displayPath(summary.path, showQueryParams)}
        </span>
      </span>
      <span className={cx(styles.status, styles[kind])}>
        <span className={styles.dot} />
        {statusLabel(summary)}
      </span>
      <span className={styles.proto}>{protocolLabel(summary.protocol)}</span>
      <span className={styles.type}>{typeLabel(summary.responseMime)}</span>
      <span className={styles.size}>{sizeLabel(displayBytes(summary), i18n.language)}</span>
      <span className={styles.time}>{timeLabel(summary, i18n.language, timeLabels)}</span>
    </button>
  );
});

