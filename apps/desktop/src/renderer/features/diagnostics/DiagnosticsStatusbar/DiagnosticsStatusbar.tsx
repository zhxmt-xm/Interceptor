import { StatItem } from '../../../components';
import { useDiagnostics } from '../DiagnosticsProvider';

/** Diagnostics status bar: record count, drop count and retention policy. */
export function DiagnosticsStatusbar(): React.JSX.Element {
  const { records, droppedCount } = useDiagnostics();

  return (
    <>
      <StatItem dot="green">Diagnostics</StatItem>
      <StatItem mono>{records.length.toLocaleString()} records</StatItem>
      <StatItem>{droppedCount} dropped under load</StatItem>
      <StatItem mono push>
        retention 7d · redacted
      </StatItem>
    </>
  );
}
