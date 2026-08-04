import { Clock, Send } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
import { Button } from '../../../components/Button/Button';
import { IconButton } from '../../../components/IconButton/IconButton';
import { InputBox } from '../../../components/InputBox/InputBox';
import { MethodBadge } from '../../../components/MethodBadge/MethodBadge';
import { Select } from '../../../components/Select/Select';
import { METHOD_OPTIONS } from '../constants';
import { readRuntime, useComposerStore } from '../data/composerStore';
import { sendRequest } from '../data/useCollection';
import type { CollectionRequest } from '../interfaces';
import { splitScheme } from '../utils';

import { RecentSends } from './RecentSends';
import styles from './RequestUrlBar.module.css';

export interface RequestUrlBarProps {
  request: CollectionRequest;
}

/** URL 行：method 选择、地址输入、Send 与 Recent sends 触发。 */
export function RequestUrlBar({ request }: RequestUrlBarProps): React.JSX.Element {
  const { t } = useTranslation();
  const sending = useComposerStore(
    (state) => readRuntime(state.runtimes, request.id).sending,
  );
  const historyOpen = useComposerStore((state) => state.historyOpen);
  const setHistoryOpen = useComposerStore((state) => state.setHistoryOpen);
  const updateRequest = useComposerStore((state) => state.updateRequest);

  const [scheme, rest] = splitScheme(request.url);

  return (
    <div className={styles.row}>
      <Select
        className={styles.method}
        value={request.method}
        options={METHOD_OPTIONS}
        onValueChange={(method) => updateRequest({ ...request, method })}
        ariaLabel={t('composer.method')}
        automationId={AUTOMATION_IDS.composer.method}
        renderItem={(method) => <MethodBadge method={method} />}
      />

      <InputBox
        className={styles.url}
        value={rest}
        onValueChange={(next) => updateRequest({ ...request, url: scheme + next })}
        placeholder={t('composer.requestUrlPlaceholder')}
        ariaLabel={t('composer.requestUrl')}
        automationId={AUTOMATION_IDS.composer.url}
      >
        {scheme ? <span className={styles.scheme}>{scheme}</span> : null}
      </InputBox>

      <Button
        icon={Send}
        variant="primary"
        className={styles.send}
        loading={sending}
        disabled={request.url.trim() === ''}
        onClick={() => void sendRequest(request)}
        automationId={AUTOMATION_IDS.composer.send}
      >
        {t('composer.send')}
      </Button>

      <div className={styles.actions}>
        <IconButton
          icon={Clock}
          label={t('composer.history')}
          size="sm"
          onClick={() => setHistoryOpen(!historyOpen)}
          automationId={AUTOMATION_IDS.composer.history}
        />
      </div>

      {historyOpen ? (
        <RecentSends
          onReplay={(entry) => {
            updateRequest({ ...request, method: entry.method, url: entry.url });
            setHistoryOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
