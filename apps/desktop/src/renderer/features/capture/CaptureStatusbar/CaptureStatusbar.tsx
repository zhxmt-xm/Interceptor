import { StatItem } from '../../../components';
import { useCaptureStore } from '../captureStore';

/** Capture status bar: truthful recording indicator, loopback binding and loaded count. */
export function CaptureStatusbar(): React.JSX.Element {
  const capturing = useCaptureStore((state) => state.capturing);
  const rowCount = useCaptureStore((state) => state.rows.length);
  return (
    <>
      {capturing ? (
        <StatItem dot="red">Recording</StatItem>
      ) : (
        <StatItem>Not recording</StatItem>
      )}
      <StatItem mono>127.0.0.1 · loopback only</StatItem>
      <StatItem mono push>
        {rowCount} {rowCount === 1 ? 'request' : 'requests'}
      </StatItem>
    </>
  );
}
