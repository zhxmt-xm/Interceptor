import { useTranslation } from 'react-i18next';

import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
import { Chip } from '../../../components/Chip/Chip';
import { cx } from '../../../components/share/cx';
import { ComposerTabBar } from '../ComposerTabBar/ComposerTabBar';
import { readRuntime, useComposerStore } from '../data/composerStore';
import type { CollectionRequest, ResponseTab } from '../interfaces';
import { formatBytes, responseCookies, statusTone } from '../utils';

import { ResponseBodyPane } from './ResponseBodyPane';
import { ResponseCookiesPane } from './ResponseCookiesPane';
import { ResponseHeadersPane } from './ResponseHeadersPane';
import styles from './ResponsePane.module.css';
import { ResponsePlaceholder } from './ResponsePlaceholder';
import { ResponseTimingPane } from './ResponseTimingPane';

export interface ResponsePaneProps {
  request: CollectionRequest;
}

/** 响应区：无响应或发送中显示占位，其余按四个页签展示。 */
export function ResponsePane({ request }: ResponsePaneProps): React.JSX.Element {
  const { t } = useTranslation();
  const runtime = useComposerStore((state) =>
    readRuntime(state.runtimes, request.id),
  );
  const setResponseTab = useComposerStore((state) => state.setResponseTab);
  const response = runtime.response;
  // Core 以 ok=false 返回网络/URL失败；它不是可展示的HTTP响应，按错误态而不是空响应壳呈现。
  const failed = response !== null && !response.ok;

  if (runtime.sending || !response || failed) {
    return (
      <div
        className={styles.response}
        data-automation-id={AUTOMATION_IDS.composer.response}
        data-send-state={runtime.sending ? 'sending' : failed ? 'failed' : 'empty'}
      >
        <ResponsePlaceholder
          sending={runtime.sending}
          sendError={runtime.sending
            ? runtime.sendError
            : failed
              ? response.error ?? t('composer.sendFailed')
              : runtime.sendError}
        />
      </div>
    );
  }

  const tone = statusTone(response.status);

  return (
    <div
      className={styles.response}
      data-automation-id={AUTOMATION_IDS.composer.response}
      data-send-state="ready"
    >
      <ComposerTabBar
        tabs={[
          {
            id: 'body',
            label: t('composer.body'),
            automationId: AUTOMATION_IDS.composer.responseTab.body,
          },
          {
            id: 'headers',
            label: t('composer.headers'),
            count: response.headers.length,
            automationId: AUTOMATION_IDS.composer.responseTab.headers,
          },
          {
            id: 'cookies',
            label: t('composer.cookies'),
            count: responseCookies(response).length,
            automationId: AUTOMATION_IDS.composer.responseTab.cookies,
          },
          {
            id: 'timing',
            label: t('composer.timing'),
            automationId: AUTOMATION_IDS.composer.responseTab.timing,
          },
        ]}
        active={runtime.responseTab}
        onSelect={(tab) => setResponseTab(request.id, tab as ResponseTab)}
        trailing={
          <>
            <span className={cx(styles.status, styles[tone])}>
              <span className={styles.dot} />
              {response.status} {response.statusText}
            </span>
            <span className={styles.metric}>
              {t('composer.durationMs', { value: response.durationMs })}
            </span>
            <span className={styles.metric}>
              {formatBytes(response.totalBytes)}
            </span>
            <Chip className={styles.protocol}>{response.httpVersion}</Chip>
          </>
        }
      />

      {runtime.responseTab === 'body' ? (
        <ResponseBodyPane requestId={request.id} response={response} />
      ) : null}
      {runtime.responseTab === 'headers' ? (
        <ResponseHeadersPane request={request} response={response} />
      ) : null}
      {runtime.responseTab === 'cookies' ? (
        <ResponseCookiesPane response={response} />
      ) : null}
      {runtime.responseTab === 'timing' ? (
        <ResponseTimingPane response={response} />
      ) : null}
    </div>
  );
}
