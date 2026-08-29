import { Progress } from 'antd';
import { ChevronDown, ChevronUp, Send, Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AUTOMATION_IDS } from '../../../../shared/automation-ids';
import type { AgentModelSummary, AgentSessionSnapshot } from '../../../../shared/desktop-api';
import { IconButton } from '../../../components';
import { AgentModelMenu } from '../AgentModelMenu/AgentModelMenu';
import { AgentSessionUsage } from '../AgentSessionUsage/AgentSessionUsage';
import { AgentSessionActions, useAgentSessionStore } from '../data/agentSessionStore';
import { ProviderLogo } from '../ProviderLogo/ProviderLogo';
import { compactTokenCount } from '../utils';
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
  const running = turn?.status === 'running';
  const currentModel = models.find((model) => model.providerId === session.summary.providerId)
    ?? models[0];
  const contextTokens = session.contextUsage.currentContextTokens ?? 0;
  const contextWindowTokens = session.contextUsage.contextWindowTokens;
  const contextPercent = contextWindowTokens === 0
    ? 0
    : Math.min(100, (contextTokens / contextWindowTokens) * 100);

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
        <AgentSessionUsage usage={session.usage} />
        <div
          className={styles.contextUsage}
          data-automation-id={AUTOMATION_IDS.agent.context}
          data-current-tokens={session.contextUsage.currentContextTokens ?? ''}
          data-max-output-tokens={session.contextUsage.maxOutputTokens}
          data-source={session.contextUsage.source}
          data-window-tokens={contextWindowTokens}
          data-parity="agent-context-usage"
        >
          <Progress
            percent={contextPercent}
            railColor="var(--border)"
            showInfo={false}
            size={22}
            strokeColor="var(--accent)"
            strokeWidth={11}
            type="circle"
          />
          <span>
            <b>{t('agent.context')}</b>
            <code>{contextPercent.toFixed(1)}% · {compactTokenCount(contextTokens)} / {compactTokenCount(contextWindowTokens)}</code>
          </span>
        </div>
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
