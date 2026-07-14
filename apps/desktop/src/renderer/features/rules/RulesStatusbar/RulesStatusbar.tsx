import { StatItem } from '../../../components';

/** Rules status bar: rule-set state, revision and buffering summary. */
export function RulesStatusbar(): React.JSX.Element {
  return (
    <>
      <StatItem dot="green">Rule set applied</StatItem>
      <StatItem mono>rev 42</StatItem>
      <StatItem>6 of 8 enabled</StatItem>
      <StatItem mono push>
        2 force body buffering
      </StatItem>
    </>
  );
}
