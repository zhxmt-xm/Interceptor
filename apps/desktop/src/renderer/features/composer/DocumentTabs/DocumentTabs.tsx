import { PanelLeft, Plus, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { findLeaf } from '@interceptor/core-protocol';

import { IconButton } from '../../../components/IconButton/IconButton';
import { MethodBadge } from '../../../components/MethodBadge/MethodBadge';
import { cx } from '../../../components/share/cx';
import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
import { useComposerStore } from '../data/composerStore';

import styles from './DocumentTabs.module.css';

/** 打开的请求文档标签条，兼放 Collection 分栏开关与新建按钮。 */
export function DocumentTabs(): React.JSX.Element {
  const { t } = useTranslation();
  const nodes = useComposerStore((state) => state.nodes);
  const openRequestIds = useComposerStore((state) => state.openRequestIds);
  const activeRequestId = useComposerStore((state) => state.activeRequestId);
  const collectionOpen = useComposerStore((state) => state.collectionOpen);
  const setCollectionOpen = useComposerStore((state) => state.setCollectionOpen);
  const setActiveRequest = useComposerStore((state) => state.setActiveRequest);
  const closeRequest = useComposerStore((state) => state.closeRequest);
  const createRequest = useComposerStore((state) => state.createRequest);

  return (
    <div
      className={styles.docs}
      data-automation-id={AUTOMATION_IDS.composer.documentTabs}
    >
      <IconButton
        icon={PanelLeft}
        label={t('composer.toggleCollection')}
        size="sm"
        className={cx(styles.toggle, collectionOpen && styles.open)}
        onClick={() => setCollectionOpen(!collectionOpen)}
      />
      <div className={styles.list}>
        {openRequestIds.map((requestId) => {
          const request = findLeaf(nodes, requestId);
          if (!request) {
            return null;
          }
          return (
            <div
              key={requestId}
              className={cx(
                styles.doc,
                activeRequestId === requestId && styles.active,
              )}
              role="tab"
              tabIndex={0}
              aria-selected={activeRequestId === requestId}
              onClick={() => setActiveRequest(requestId)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  setActiveRequest(requestId);
                }
              }}
            >
              <MethodBadge method={request.method} size="sm" />
              <span className={styles.docName}>{request.name}</span>
              <button
                type="button"
                className={styles.close}
                aria-label={t('composer.closeRequest')}
                onClick={(event) => {
                  event.stopPropagation();
                  closeRequest(requestId);
                }}
              >
                <X strokeWidth={2.2} />
              </button>
            </div>
          );
        })}
        <IconButton
          icon={Plus}
          label={t('composer.newRequest')}
          size="sm"
          className={styles.add}
          onClick={createRequest}
        />
      </div>
    </div>
  );
}
