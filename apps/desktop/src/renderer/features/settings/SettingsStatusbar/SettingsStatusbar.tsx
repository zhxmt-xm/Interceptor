import { StatItem } from '../../../components';

/** Settings status bar: core state, proxy binding and trust summary. */
export function SettingsStatusbar(): React.JSX.Element {
  return (
    <>
      <StatItem dot="green">Core Running</StatItem>
      <StatItem mono>127.0.0.1:8888</StatItem>
      <StatItem dot="green">System Proxy</StatItem>
      <StatItem mono push>
        CA trusted · MITM on
      </StatItem>
    </>
  );
}
