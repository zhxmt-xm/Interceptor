import { StatItem } from '../../../components';

/** Capture status bar: recording state, proxy binding and live throughput. */
export function CaptureStatusbar(): React.JSX.Element {
  return (
    <>
      <StatItem dot="red">Recording</StatItem>
      <StatItem mono>127.0.0.1:8888</StatItem>
      <StatItem dot="green">System Proxy</StatItem>
      <StatItem mono>18 of 241 requests</StatItem>
      <StatItem mono push>
        {'↑ 12.4 KB/s\u00a0\u00a0↓ 380 B/s'}
      </StatItem>
    </>
  );
}
