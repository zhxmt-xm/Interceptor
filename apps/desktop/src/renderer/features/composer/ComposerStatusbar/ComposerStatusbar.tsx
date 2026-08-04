import { useTranslation } from 'react-i18next';

import { StatItem } from '../../../components/StatItem/StatItem';
import { readRuntime, useComposerStore } from '../data/composerStore';

/** Composer 底部状态栏：当前文档的发送状态、对端地址与最近一次结果。 */
export function ComposerStatusbar(): React.JSX.Element {
  const { i18n, t } = useTranslation();
  const runtime = useComposerStore((state) =>
    readRuntime(state.runtimes, state.activeRequestId),
  );
  const lastSend = useComposerStore((state) => state.history[0]);

  const dot = runtime.sending ? 'yellow' : runtime.sendError ? 'red' : 'green';
  const label = runtime.sending
    ? t('composer.sending')
    : runtime.sendError
      ? t('composer.sendFailed')
      : t('composer.ready');

  return (
    <>
      <StatItem dot={dot}>{label}</StatItem>
      {runtime.response?.remoteAddress ? (
        <StatItem mono>{runtime.response.remoteAddress}</StatItem>
      ) : null}
      {lastSend ? (
        <StatItem mono push>
          {t('composer.lastSend', {
            status: lastSend.status || 'ERR',
            duration: t('composer.durationMs', {
              value: new Intl.NumberFormat(i18n.language).format(
                lastSend.durationMs,
              ),
            }),
          })}
        </StatItem>
      ) : null}
    </>
  );
}
