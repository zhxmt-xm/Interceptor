import { StatItem } from '../../../components';
import { useTranslation } from 'react-i18next';
import { useComposerStore } from '../data/composerStore';

/** Composer status bar: ready state, target host and last send result. */
export function ComposerStatusbar(): React.JSX.Element {
  const { i18n, t } = useTranslation();
  const sending = useComposerStore((state) => state.sending);
  const sendError = useComposerStore((state) => state.sendError);
  const response = useComposerStore((state) => state.response);
  const last = useComposerStore((state) => state.history[0]);

  const dot = sending ? 'yellow' : sendError || response?.ok === false ? 'red' : 'green';
  const label = sending ? t('composer.sending') : sendError ? t('composer.sendFailed') : t('composer.ready');

  return (
    <>
      <StatItem dot={dot}>{label}</StatItem>
      {response?.remoteAddress ? (
        <StatItem mono>{response.remoteAddress}</StatItem>
      ) : null}
      {last ? (
        <StatItem mono push>
          {t('composer.lastSend', {
            status: last.status || 'ERR',
            duration: `${new Intl.NumberFormat(i18n.language).format(last.durationMs)} ms`,
          })}
        </StatItem>
      ) : null}
    </>
  );
}
