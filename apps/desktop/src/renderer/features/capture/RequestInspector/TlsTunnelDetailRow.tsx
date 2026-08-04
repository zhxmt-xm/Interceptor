import styles from './TlsTunnelDetailRow.module.css';

export interface TlsTunnelDetailRowProps {
  label: string;
  value: string;
  /** 协议名这类关键值用强调色。 */
  accent?: boolean;
}

/** TLS 直通面板里的一行标签与取值。 */
export function TlsTunnelDetailRow({
  label,
  value,
  accent = false,
}: TlsTunnelDetailRowProps): React.JSX.Element {
  return (
    <div className={styles.row}>
      <span>{label}</span>
      <code className={accent ? styles.accent : undefined}>{value}</code>
    </div>
  );
}
