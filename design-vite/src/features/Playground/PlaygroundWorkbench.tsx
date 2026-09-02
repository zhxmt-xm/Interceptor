import { CircleCheck, Clock3, Play, Square } from 'lucide-react';

import { useDesignState } from '../../state/useDesignState';
import { playgroundSchema, playgroundTool, playgroundTrafficScenario } from './playgroundData';
import styles from './PlaygroundWorkbench.module.css';

export function PlaygroundWorkbench(): React.JSX.Element {
  const { state, updateState } = useDesignState();
  if (state.playgroundSection === 'capture') {
    const scenario = playgroundTrafficScenario(state.playgroundSelectedScenario);
    return (
      <section className={styles.playgroundWorkbench} data-playground-workbench="capture">
        <header className={styles.playgroundWorkbenchTitle}><div><span>Capture scenario</span><h1>{scenario.title}</h1><p>{scenario.detail}</p></div></header>
        <div className={styles.playgroundSection}>
          <h2>Request Draft JSON</h2>
          <textarea className={styles.draftEditor} aria-label="Request Draft JSON" spellCheck={false} value={state.playgroundRequestDraft} onChange={(event) => updateState({ playgroundRequestDraft: event.target.value })} />
        </div>
        <section className={styles.playgroundRecipe}><div data-testid="scenario-setup"><h2>Setup manually</h2><ol>{scenario.setup.map((step) => <li key={step}>{step}</li>)}</ol></div><div data-testid="scenario-observations"><h2>Observe</h2><ol>{scenario.observations.map((step) => <li key={step}>{step}</li>)}</ol></div></section>
        <div className={styles.playgroundActivity}><CircleCheck aria-hidden="true" /><div><strong>Last run completed</strong><span>Origin received 1 request · 200 OK · 184 B · 38 ms</span></div></div>
      </section>
    );
  }

  const tool = playgroundTool(state.playgroundSelectedTool);
  const waiting = state.playgroundCallState === 'approval';
  const setupSteps = tool.name === 'stop_recording'
    ? ['Start Recording in Capture.', 'Keep this MCP Client in Ask mode.']
    : ['Open Capture and note listener and Recording state.'];
  const observationSteps = tool.name === 'stop_recording'
    ? ['Deny keeps Recording active.', 'Allow pauses capture without stopping proxy forwarding.']
    : ['Result matches the visible listener and Recording state.', 'No approval appears.'];
  return (
    <section className={styles.playgroundWorkbench} data-playground-workbench="mcp">
      <header className={styles.playgroundWorkbenchTitle}>
        <div><span>{tool.capabilityId}</span><h1>{tool.title}<em data-kind={tool.kind}>{tool.kind}</em></h1><p>{tool.description}</p></div>
        <button className={styles.primary} type="button" onClick={() => updateState({ playgroundCallState: tool.kind === 'change' ? 'approval' : 'complete' })}>{waiting ? <Square aria-hidden="true" /> : <Play aria-hidden="true" />}{waiting ? 'Abort' : 'Call Tool'}</button>
      </header>
      <section className={styles.playgroundAnnotations}><span>read only <strong>{String(tool.kind === 'query')}</strong></span><span>destructive <strong>{String(tool.destructive)}</strong></span><span>idempotent <strong>{String(tool.kind === 'query')}</strong></span><span>open world <strong>{String(tool.openWorld)}</strong></span></section>
      <div className={styles.playgroundSection}><h2>Arguments</h2><pre>{'{}'}</pre></div>
      <div className={styles.playgroundSection}><h2>Input schema</h2><pre>{playgroundSchema(tool.name)}</pre></div>
      <section className={styles.playgroundRecipe}><div><h2>Setup manually</h2><ol>{setupSteps.map((step) => <li key={step}>{step}</li>)}</ol></div><div><h2>Observe</h2><ol>{observationSteps.map((step) => <li key={step}>{step}</li>)}</ol></div></section>
      <div className={`${styles.playgroundActivity} ${waiting ? styles.waiting : ''}`}>
        {waiting ? <Clock3 aria-hidden="true" /> : <CircleCheck aria-hidden="true" />}
        <div><strong>{waiting ? 'Waiting for approval in Interceptor' : 'Call completed'}</strong><span>{waiting ? 'POST remains open · no product state changed' : 'HTTP 200 · resultType complete · 42 ms'}</span></div>
      </div>
    </section>
  );
}