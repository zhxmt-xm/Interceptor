import { StatItem } from '../../../components';

/** Breakpoints status bar: paused count, binding, timeout and match state. */
export function BreakpointsStatusbar(): React.JSX.Element {
  return (
    <>
      <StatItem dot="yellow">2 paused</StatItem>
      <StatItem mono>127.0.0.1:8888</StatItem>
      <StatItem>timeout 60s → continue</StatItem>
      <StatItem mono push>
        break on match · on
      </StatItem>
    </>
  );
}
