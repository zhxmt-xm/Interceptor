import { App } from 'antd';
import type { TFunction } from 'i18next';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
import type {
  CaptureExchangeSummary,
  CaptureReplayOutcome,
} from '../../../../shared/desktop-api';
import { useCaptureStore } from './captureStore';

/** 把一条已录制的请求经本地代理重发，并给出成功/失败反馈。 */
export function useReplayRequest(): (summary: CaptureExchangeSummary) => void {
  const { message } = App.useApp();
  const { t } = useTranslation();
  return useCallback((summary: CaptureExchangeSummary): void => {
    void (async () => {
      let outcome: CaptureReplayOutcome;
      try {
        outcome = await window.interceptor.replayCapture(summary.id);
      } catch (error) {
        outcome = {
          ok: false,
          reason: 'send-failed',
          message: error instanceof Error ? error.message : String(error),
        };
      }
      if (outcome.ok) {
        const recording = useCaptureStore.getState().capturing;
        void message.success(
          <span
            data-automation-id={AUTOMATION_IDS.capture.replayNotice}
            data-state={recording ? 'sent' : 'paused'}
          >
            {t(recording ? 'capture.replaySent' : 'capture.replaySentPaused')}
          </span>,
        );
        return;
      }
      void message.error(
        <span
          data-automation-id={AUTOMATION_IDS.capture.replayNotice}
          data-state="failed"
        >
          {replayFailureMessage(outcome, t)}
        </span>,
      );
    })();
  }, [message, t]);
}

/** 把失败原因映射成提示；HTTPS 未解密时给出打开设置入口。 */
function replayFailureMessage(
  outcome: Extract<CaptureReplayOutcome, { ok: false }>,
  t: TFunction,
): React.ReactNode {
  switch (outcome.reason) {
    case 'not-found':
      return t('capture.replayFailed.notFound');
    case 'unsupported-exchange':
      return t('capture.replayFailed.unsupported');
    case 'proxy-not-listening':
      return t('capture.replayFailed.proxyNotListening');
    case 'https-not-decrypted':
      return (
        <span>
          {t('capture.replayFailed.httpsNotDecrypted')}{' '}
          <a
            role="button"
            tabIndex={0}
            onClick={() => useCaptureStore.getState().setHttpsSetupOpen(true)}
          >
            {t('capture.replayFailed.openHttpsSetup')}
          </a>
        </span>
      );
    case 'request-body-unavailable':
      return t('capture.replayFailed.bodyUnavailable');
    case 'request-body-truncated':
      return t('capture.replayFailed.bodyTruncated');
    case 'send-failed':
      return t('capture.replayFailed.sendFailed', { message: outcome.message ?? '' });
  }
}
