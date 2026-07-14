import { StatItem } from '../../../components';

/** Composer status bar: ready state, proxy binding and last send result. */
export function ComposerStatusbar(): React.JSX.Element {
  return (
    <>
      <StatItem dot="green">Ready</StatItem>
      <StatItem mono>127.0.0.1:8888</StatItem>
      <StatItem mono push>
        last send 201 · 142 ms
      </StatItem>
    </>
  );
}
