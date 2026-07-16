import { StatItem } from '../../../components';
import { useComposerStore } from '../composerStore';

/** Composer status bar: ready state, target host and last send result. */
export function ComposerStatusbar(): React.JSX.Element {
  const sending = useComposerStore((state) => state.sending);
  const sendError = useComposerStore((state) => state.sendError);
  const response = useComposerStore((state) => state.response);
  const last = useComposerStore((state) => state.history[0]);

  const dot = sending ? 'yellow' : sendError || response?.ok === false ? 'red' : 'green';
  const label = sending ? 'Sending…' : sendError ? 'Send failed' : 'Ready';

  return (
    <>
      <StatItem dot={dot}>{label}</StatItem>
      {response?.remoteAddress ? (
        <StatItem mono>{response.remoteAddress}</StatItem>
      ) : null}
      {last ? (
        <StatItem mono push>
          last send {last.status || 'ERR'} · {last.durationMs} ms
        </StatItem>
      ) : null}
    </>
  );
}
