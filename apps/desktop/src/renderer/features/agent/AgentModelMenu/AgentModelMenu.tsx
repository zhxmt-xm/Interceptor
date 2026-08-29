import { Check, Settings2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { RefObject } from 'react';

import type { AgentModelSummary, AgentSessionSnapshot } from '../../../../shared/desktop-api';
import { ProviderLogo } from '../ProviderLogo/ProviderLogo';
import { AgentSessionActions } from '../data/agentSessionStore';
import { navigateAgentListbox } from '../utils';
import styles from './AgentModelMenu.module.css';

interface AgentModelMenuProps {
  readonly models: readonly AgentModelSummary[];
  readonly onClose: () => void;
  readonly onConfigure: () => void;
  readonly open: boolean;
  readonly session: AgentSessionSnapshot;
  readonly triggerRef: RefObject<HTMLButtonElement | null>;
}

/** Selects one configured model for this Chat without changing the global default. */
export function AgentModelMenu({
  models,
  onClose,
  onConfigure,
  open,
  session,
  triggerRef,
}: AgentModelMenuProps): React.JSX.Element | null {
  const { t } = useTranslation();
  if (!open) return null;

  const select = (providerId: string): void => {
    onClose();
    void AgentSessionActions.setModel(providerId).catch(() => undefined);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  return (
    <div
      aria-label={t('agent.modelForChat')}
      className={styles.menu}
      data-parity="agent-model-menu"
      onKeyDown={(event) => navigateAgentListbox(event, onClose, triggerRef)}
    >
      <span className={styles.label} id="agent-model-menu-label">{t('agent.modelForChat')}</span>
      <div aria-labelledby="agent-model-menu-label" role="listbox">
        {models.map((model) => {
          const selected = model.providerId === session.summary.providerId;
          return (
            <button
              aria-selected={selected}
              autoFocus={selected}
              className={styles.item}
              key={model.providerId}
              role="option"
              tabIndex={selected ? 0 : -1}
              type="button"
              onClick={() => select(model.providerId)}
            >
              <ProviderLogo
                active={selected}
                brand={model.kind === 'deepseek' ? 'deepseek' : 'unknown'}
              />
              <span><strong>{model.profileName}</strong><code>{model.modelId}</code></span>
              {selected ? <Check aria-label={t('agent.selected')} /> : null}
            </button>
          );
        })}
      </div>
      <button
        className={styles.manage}
        type="button"
        onClick={() => {
          onClose();
          onConfigure();
        }}
      >
        <Settings2 aria-hidden="true" />
        {t('agent.settings')}
      </button>
    </div>
  );
}
