import { ChevronDown, ChevronUp, Send, Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
import type { AgentModelSummary, AgentSessionSnapshot } from '../../../../shared/desktop-api';
import { IconButton, Segmented } from '../../../components';
import { AgentModelMenu } from '../AgentModelMenu/AgentModelMenu';
import { AgentSessionUsage } from '../AgentSessionUsage/AgentSessionUsage';
import { AgentSessionActions, useAgentSessionStore } from '../data/agentSessionStore';
import { ProviderLogo } from '../ProviderLogo/ProviderLogo';
import styles from './AgentPanelComposer.module.css';

interface AgentPanelComposerProps {
  readonly models: readonly AgentModelSummary[];
  readonly onConfigure: () => void;
  readonly session: AgentSessionSnapshot;
}

/** Sends user messages and exposes model, Context, Usage and Stop controls. */
export function AgentPanelComposer({
  models,
  onConfigure,
  session,
}: AgentPanelComposerProps): React.JSX.Element {
  const { t } = useTranslation();
  const busy = useAgentSessionStore((state) => state.busy);
  const [draft, setDraft] = useState('');
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const modelSelectorRef = useRef<HTMLButtonElement>(null);
  const turn = session.currentTurn;
  const running = turn?.status === 'running' || turn?.status === 'waiting-for-tool-approval';
  const currentModel = models.find((model) => model.providerId === session.summary.providerId)
    ?? models[0];

  useEffect(() => {
    setDraft('');
    setModelMenuOpen(false);
  }, [session.sessionId]);

  const send = (): void => {
    const content = draft.trim();
    if (!content || running || busy) return;
    setDraft('');
    void AgentSessionActions.send(content).catch(() => {
      setDraft(content);
    });
  };

  return (
    <footer className={styles.footer}>
      <AgentModelMenu
        models={models}
        onClose={() => setModelMenuOpen(false)}
        onConfigure={onConfigure}
        open={modelMenuOpen}
        session={session}
        triggerRef={modelSelectorRef}
      />
      <div className={styles.metrics}>
        <button
          aria-expanded={modelMenuOpen}
          aria-haspopup="listbox"
          aria-label={currentModel?.profileName ?? t('agent.modelForChat')}
          className={styles.modelButton}
          data-parity="agent-model-select"
          disabled={running || busy}
          ref={modelSelectorRef}
          type="button"
          onClick={() => setModelMenuOpen((open) => !open)}
        >
          <ProviderLogo
            active
            brand={currentModel?.kind === 'deepseek' ? 'deepseek' : 'unknown'}
          />
          <span>{currentModel?.profileName ?? session.summary.modelId}</span>
          {modelMenuOpen ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
        </button>
        <span
          className={styles.executionMode}
          data-automation-id={AUTOMATION_IDS.agent.executionMode.root}
          data-parity="agent-execution-mode"
        >
          <Segmented
            ariaLabel={t('agent.executionMode')}
            automationIds={{
              ask: AUTOMATION_IDS.agent.executionMode.ask,
              auto: AUTOMATION_IDS.agent.executionMode.auto,
            }}
            options={[
              { label: t('agent.executionAsk'), value: 'ask', disabled: busy },
              { label: t('agent.executionAuto'), value: 'auto', disabled: busy },
            ]}
            value={session.toolExecutionMode}
            onChange={(mode) => {
              const change = mode === 'ask'
                ? AgentSessionActions.requireToolApproval()
                : AgentSessionActions.automaticallyExecuteTools();
              void change.catch(() => undefined);
            }}
          />
        </span>
        <AgentSessionUsage contextUsage={session.contextUsage} usage={session.usage} />
      </div>
      <div className={styles.composer} data-parity="agent-composer">
        <textarea
          aria-label={t('agent.message')}
          data-automation-id={AUTOMATION_IDS.agent.message.input}
          disabled={running}
          placeholder={t('agent.messagePlaceholder')}
          rows={2}
          value={draft}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              send();
            }
          }}
        />
        <span className={styles.send} data-parity="agent-send">
          {running && turn !== null ? (
            <IconButton
              automationId={AUTOMATION_IDS.agent.turn.stop}
              className={styles.stop}
              icon={Square}
              label={t('agent.stopResponse')}
              onClick={() => void AgentSessionActions.cancel(turn.turnId).catch(() => undefined)}
              size="sm"
            />
          ) : (
            <IconButton
              automationId={AUTOMATION_IDS.agent.message.send}
              disabled={busy || draft.trim().length === 0}
              icon={Send}
              label={t('agent.sendMessage')}
              onClick={send}
              size="sm"
            />
          )}
        </span>
      </div>
    </footer>
  );
}
