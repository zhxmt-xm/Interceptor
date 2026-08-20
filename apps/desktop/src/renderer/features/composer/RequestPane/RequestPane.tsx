import { useTranslation } from 'react-i18next';

import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
import { Segmented } from '../../../components/Segmented/Segmented';
import { ComposerTabBar } from '../ComposerTabBar/ComposerTabBar';
import { readRuntime, useComposerStore } from '../data/composerStore';
import type {
  CollectionRequest,
  ComposerProtocol,
  RequestTab,
} from '../interfaces';
import { KeyValueTable } from '../KeyValueTable/KeyValueTable';
import { buildRequestBody } from '../utils';

import { AuthPane } from './AuthPane';
import { BodyPane } from './BodyPane';
import styles from './RequestPane.module.css';

export interface RequestPaneProps {
  request: CollectionRequest;
}

/** 请求编辑区：四个页签共用一条 tab 条，右侧是协议选择。 */
export function RequestPane({ request }: RequestPaneProps): React.JSX.Element {
  const { t } = useTranslation();
  const activeTab = useComposerStore(
    (state) => readRuntime(state.runtimes, request.id).requestTab,
  );
  const setRequestTab = useComposerStore((state) => state.setRequestTab);
  const updateRequest = useComposerStore((state) => state.updateRequest);

  return (
    <div className={styles.request}>
      <ComposerTabBar
        tabs={[
          {
            id: 'query',
            label: t('composer.query'),
            count: request.query.length,
            automationId: AUTOMATION_IDS.composer.tab.query,
          },
          {
            id: 'headers',
            label: t('composer.headers'),
            count: request.headers.length,
            automationId: AUTOMATION_IDS.composer.tab.headers,
          },
          {
            id: 'body',
            label: t('composer.body'),
            dot: buildRequestBody(request) !== undefined,
            automationId: AUTOMATION_IDS.composer.tab.body,
          },
          {
            id: 'auth',
            label: t('composer.auth'),
            automationId: AUTOMATION_IDS.composer.tab.auth,
          },
        ]}
        active={activeTab}
        onSelect={(tab) => setRequestTab(request.id, tab as RequestTab)}
        trailing={
          <Segmented
            options={[
              { label: t('composer.auto'), value: 'auto' },
              { label: 'HTTP/1.1', value: 'http/1.1' },
              { label: 'HTTP/2', value: 'h2' },
            ]}
            value={request.protocol}
            onChange={(protocol) =>
              updateRequest({ ...request, protocol: protocol as ComposerProtocol })
            }
            ariaLabel={t('composer.protocol')}
            automationIds={{
              auto: AUTOMATION_IDS.composer.protocol.auto,
              'http/1.1': AUTOMATION_IDS.composer.protocol.h1,
              h2: AUTOMATION_IDS.composer.protocol.h2,
            }}
          />
        }
      />

      {activeTab === 'query' ? (
        <KeyValueTable
          rows={request.query}
          onChange={(query) => updateRequest({ ...request, query })}
          nameLabel={t('composer.name')}
          valueLabel={t('composer.value')}
          draftAutomationIds={{
            ...AUTOMATION_IDS.composer.queryDraft,
            confirm: AUTOMATION_IDS.composer.addQuery,
          }}
        />
      ) : null}

      {activeTab === 'headers' ? (
        <KeyValueTable
          rows={request.headers}
          onChange={(headers) => updateRequest({ ...request, headers })}
          nameLabel={t('composer.name')}
          valueLabel={t('composer.value')}
          draftAutomationIds={{
            ...AUTOMATION_IDS.composer.headerDraft,
            confirm: AUTOMATION_IDS.composer.addHeader,
          }}
        />
      ) : null}

      {activeTab === 'body' ? <BodyPane request={request} /> : null}
      {activeTab === 'auth' ? <AuthPane request={request} /> : null}
    </div>
  );
}
