import { StatItem } from '../../../components';
import { useBreakpointsStore } from '../breakpointsStore';

/** Breakpoints status bar: paused count, timeout policy and match state. */
export function BreakpointsStatusbar(): React.JSX.Element {
  const count = useBreakpointsStore((state) => state.breakpoints.length);
  const enabled = useBreakpointsStore((state) => state.enabled);

  return (
    <>
      <StatItem dot={count > 0 ? 'yellow' : enabled ? 'green' : undefined}>
        {count} paused
      </StatItem>
      <StatItem>timeout per rule → continue / drop</StatItem>
      <StatItem mono push>
        break on match · {enabled ? 'on' : 'off'}
      </StatItem>
    </>
  );
}
