import { CheckCircle2, Wrench } from 'lucide-react';

import styles from './AgentQueryToolTrace.module.css';

const TOOL_STEPS = [
  {
    name: 'discover_tools',
    arguments: 'capabilityId: traffic',
    result: '5 tools discovered',
  },
  {
    name: 'get_storage_status',
    arguments: 'No parameters',
    result: 'Exchanges 1 · Bodies 2 · 184 B',
  },
  {
    name: 'get_proxy_status',
    arguments: 'No parameters',
    result: 'Recording on · 127.0.0.1:8888',
  },
  {
    name: 'list_exchanges',
    arguments: 'limit: 50',
    result: '1 matching exchange',
  },
  {
    name: 'get_exchange',
    arguments: 'exchangeId: e2e-agent-traffic',
    result: 'GET /agent-e2e/traffic · 200',
  },
] as const;

/** Shows completed query Tool calls as one ordered transcript activity log. */
export function AgentQueryToolTrace(): React.JSX.Element {
  return (
    <section aria-label="Tool activity" className={styles.toolTrace} data-parity="agent-query-tool-trace">
      <header className={styles.toolTraceHeader}>
        <span><Wrench aria-hidden="true" /><strong>Tool activity</strong></span>
        <small>5 completed</small>
      </header>
      <ol>
        {TOOL_STEPS.map((step) => (
          <li data-tool-name={step.name} key={step.name}>
            <span className={styles.toolTraceStatus}><CheckCircle2 aria-label="Completed" /></span>
            <div className={styles.toolTraceCopy}>
              <code>{step.name}</code>
              <span><b>Arguments</b>{step.arguments}</span>
              <span><b>Result</b>{step.result}</span>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}