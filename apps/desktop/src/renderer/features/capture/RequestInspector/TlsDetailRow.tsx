import styles from './TlsDetailRow.module.css';

export interface TlsDetailRowProps {
  label: string;
  value: string;
  /** 证书指纹这类长值用等宽字体。 */
  mono?: boolean;
}

/** TLS 面板里的一行标签与取值。 */
export function TlsDetailRow({
  label,
  value,
  mono,
}: TlsDetailRowProps): React.JSX.Element {
  return (
    <div className={styles.row}>
      <span className={styles.label}>{label}</span>
      <span className={mono ? styles.valueMono : styles.value}>{value}</span>
    </div>
  );
}
