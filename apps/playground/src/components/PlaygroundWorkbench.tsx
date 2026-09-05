import { CircleCheck, CircleX, Clock3, Play, Square } from 'lucide-react';

import type { PlaygroundSection, PlaygroundToolRun } from '../interfaces';
import type { PlaygroundMcpTool } from '../mcp/session';
import type { TrafficScenarioDescriptor, TrafficScenarioResult } from '../../server/interfaces.ts';
import { acceptanceRecipe } from '../acceptance/recipes';
import styles from './PlaygroundWorkbench.module.css';

interface PlaygroundWorkbenchProps {
  readonly argumentsText: string;
  readonly draftText: string;
  readonly draftError: string;
  readonly run: PlaygroundToolRun;
  readonly section: PlaygroundSection;
  readonly tool?: PlaygroundMcpTool;
  readonly trafficResult: TrafficScenarioResult | null;
  readonly trafficRunning: boolean;
  readonly trafficScenario?: TrafficScenarioDescriptor;
  readonly onAbort: () => void;
  readonly onArgumentsChange: (value: string) => void;
  readonly onCall: () => void;
  readonly onDraftChange: (value: string) => void;
}

export function PlaygroundWorkbench({ argumentsText, draftText, draftError, run, section, tool, trafficResult, trafficRunning, trafficScenario, onAbort, onArgumentsChange, onCall, onDraftChange }: PlaygroundWorkbenchProps): React.JSX.Element {
  if (section === 'capture') return (
    <section className={styles.playgroundWorkbench} data-playground-workbench>
      <header className={styles.playgroundWorkbenchTitle}><div><span>CAPTURE SCENARIO</span><h1>{trafficScenario?.title ?? 'Traffic scenario'}</h1><p>{trafficScenario?.description}</p></div></header>
      <section className={styles.playgroundSection}><h2>Request Draft JSON</h2><textarea aria-label="Request Draft JSON" className={styles.draftEditor} disabled={trafficScenario === undefined || trafficRunning} spellCheck={false} value={draftText} onChange={(event) => onDraftChange(event.target.value)} />{draftError ? <div className={styles.draftError} role="alert">{draftError}</div> : null}</section>
      {trafficScenario ? <section className={styles.playgroundRecipe}><div data-testid="scenario-setup"><h2>Setup manually</h2><ol>{trafficScenario.setup.map((step) => <li key={step}>{step}</li>)}</ol></div><div data-testid="scenario-observations"><h2>Observe</h2><ol>{trafficScenario.observations.map((step) => <li key={step}>{step}</li>)}</ol></div></section> : null}
      <section className={styles.playgroundSection}><h2>Client result</h2><pre>{trafficResult ? JSON.stringify(trafficResult.response ?? { error: trafficResult.error }, null, 2) : 'Run the scenario to see the response and timing.'}</pre></section>
      {trafficResult ? <div className={styles.playgroundActivity} data-state={trafficResult.state === 'complete' ? 'complete' : 'failed'} data-traffic-state={trafficResult.state}>{trafficResult.state === 'complete' ? <CircleCheck aria-hidden="true" /> : <CircleX aria-hidden="true" />}<div><strong>{trafficResult.state === 'complete' ? 'Traffic run completed' : 'Traffic run failed as designed or by environment'}</strong><span>{trafficResult.attempt.method} {trafficResult.attempt.path} · {trafficResult.durationMs} ms</span></div></div> : null}
    </section>
  );
  if (tool === undefined) return <section className={styles.playgroundWorkbench}><div className={styles.playgroundPlaceholder}>No Tool selected.</div></section>;
  const running = run.state === 'running';
  const kind = tool.annotations?.readOnlyHint ? 'query' : 'change';
  const recipe = acceptanceRecipe(tool.name);
  return (
    <section className={styles.playgroundWorkbench} data-playground-workbench>
      <header className={styles.playgroundWorkbenchTitle}><div><span>LIVE TOOLS/LIST</span><h1>{tool.title ?? tool.name}<em data-kind={kind}>{kind}</em></h1><p>{tool.description}</p></div><button data-automation-id="playground.mcp.call" type="button" onClick={running ? onAbort : onCall}>{running ? <Square aria-hidden="true" /> : <Play aria-hidden="true" />}{running ? 'Abort' : 'Call Tool'}</button></header>
      <section className={styles.playgroundAnnotations}><span>read only <strong>{String(tool.annotations?.readOnlyHint ?? false)}</strong></span><span>destructive <strong>{String(tool.annotations?.destructiveHint ?? false)}</strong></span><span>idempotent <strong>{String(tool.annotations?.idempotentHint ?? false)}</strong></span><span>open world <strong>{String(tool.annotations?.openWorldHint ?? false)}</strong></span></section>
      <section className={styles.playgroundSection}><h2>Arguments</h2><textarea aria-label="Tool arguments" data-automation-id="playground.mcp.arguments" spellCheck={false} value={argumentsText} onChange={(event) => onArgumentsChange(event.target.value)} /></section>
      <section className={styles.playgroundSection}><h2>Input schema</h2><pre>{JSON.stringify(tool.inputSchema, null, 2)}</pre></section>
      {tool.outputSchema ? <section className={styles.playgroundSection}><h2>Output schema</h2><pre>{JSON.stringify(tool.outputSchema, null, 2)}</pre></section> : null}
      {recipe ? <section className={styles.playgroundRecipe}><div><h2>Setup manually</h2><ol>{recipe.setup.map((step) => <li key={step}>{step}</li>)}</ol></div><div><h2>Observe</h2><ol>{recipe.observations.map((step) => <li key={step}>{step}</li>)}</ol></div></section> : null}
      {run.state !== 'idle' ? <div className={styles.playgroundActivity} data-automation-id="playground.mcp.run" data-state={run.state}>{run.state === 'running' ? <Clock3 aria-hidden="true" /> : run.state === 'complete' ? <CircleCheck aria-hidden="true" /> : <CircleX aria-hidden="true" />}<div><strong>{activityTitle(run.state)}</strong><span>{activityDetail(run)}</span></div></div> : null}
    </section>
  );
}

function activityTitle(state: PlaygroundToolRun['state']): string {
  if (state === 'running') return 'Request open — inspect Interceptor for approval';
  if (state === 'complete') return 'Tool call completed';
  if (state === 'aborted') return 'Tool call aborted';
  return 'Tool call failed';
}

function activityDetail(run: PlaygroundToolRun): string {
  if (run.error) return run.error;
  if (run.result) return run.result.isError ? 'Tool returned isError=true' : 'Result received from Interceptor';
  return 'The Browser request remains in flight.';
}