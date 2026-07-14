import { StatItem } from '../../../components';

/** Diagnostics status bar: record count, drop count and retention policy. */
export function DiagnosticsStatusbar(): React.JSX.Element {
  return (
    <>
      <StatItem dot="green">Diagnostics</StatItem>
      <StatItem mono>2,481 records</StatItem>
      <StatItem>3 dropped under load</StatItem>
      <StatItem mono push>
        retention 7d · redacted
      </StatItem>
    </>
  );
}
