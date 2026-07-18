import { Lock } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';

import type { CaptureExchangeSummary } from '../../../../shared/desktop-api';
import { cx, MethodBadge } from '../../../components';
import {
  displayBytes,
  protocolLabel,
  sizeLabel,
  statusKind,
  statusLabel,
  timeLabel,
  typeLabel,
} from '../row-format';
import styles from './RequestRow.module.css';

export interface RequestRowProps {
  summary: CaptureExchangeSummary;
  selected: boolean;
  onSelect: () => void;
  style?: CSSProperties;
}

/** A single request row in the capture list. */
export function RequestRow({
  summary,
  selected,
  onSelect,
  style,
}: RequestRowProps): React.JSX.Element {
  const { i18n, t } = useTranslation();
  const kind = statusKind(summary.statusCode);
  const isTlsTunnel = protocolLabel(summary.protocol) === 'tls';
  const timeLabels = {
    closed: t('capture.closed'),
    open: t('capture.open'),
    failed: t('capture.failed'),
  };
  return (
    <button
      type="button"
      className={cx(styles.row, selected && styles.selected)}
      onClick={onSelect}
      style={style}
    >
      <MethodBadge method={summary.method} />
      <span className={styles.host}>
        <span className={styles.hostName}>
          {summary.secure ? <Lock size={12} strokeWidth={2.2} /> : null}
          {summary.host ?? '—'}
        </span>
        <span className={styles.hostPath}>
          {isTlsTunnel ? t('capture.httpsEncrypted') : summary.path ?? ''}
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
}

