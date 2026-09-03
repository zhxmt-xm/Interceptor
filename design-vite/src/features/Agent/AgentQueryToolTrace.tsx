import { CheckCircle2, Wrench } from 'lucide-react';

import type { AgentToolTraceState } from '../../state/types';
import styles from './AgentQueryToolTrace.module.css';

const TOOL_STEPS = {
  traffic: [
    { name: 'discover_tools', arguments: 'capabilityId: traffic', result: '10 tools discovered' },
    { name: 'get_storage_status', arguments: 'No parameters', result: 'Exchanges 1 · Bodies 2 · 184 B' },
    { name: 'get_proxy_status', arguments: 'No parameters', result: 'Recording on · 127.0.0.1:8888' },
    { name: 'list_exchanges', arguments: 'limit: 50', result: '1 matching exchange' },
    { name: 'get_exchange', arguments: 'exchangeId: e2e-agent-traffic', result: 'GET /agent-e2e/traffic · 200' },
  ],
  'body-messages': [
    { name: 'discover_tools', arguments: 'capabilityId: traffic', result: '10 tools discovered' },
    { name: 'get_exchange', arguments: 'exchangeId: body-json', result: 'POST /playground/body/json · 200' },
    { name: 'get_exchange_body', arguments: 'exchangeId: body-json · bodyId: body-1 · length: 65536', result: '14 B · complete' },
    { name: 'list_websocket_messages', arguments: 'exchangeId: ws-bidirectional', result: '2 messages · complete' },
    { name: 'list_grpc_messages', arguments: 'exchangeId: grpc-unary-json · side: response · limit: 200', result: 'response · 1 message · complete' },
  ],
  rules: [
    { name: 'discover_tools', arguments: 'capabilityId: rules', result: '3 tools discovered' },
    { name: 'get_rules', arguments: 'No parameters', result: 'Revision 1 · Rules 1 · Enabled 1' },
    { name: 'get_rule_hits', arguments: 'No parameters', result: 'Rules 1 · Hits 1' },
  ],
} as const;

interface AgentQueryToolTraceProps {
  readonly variant: Exclude<AgentToolTraceState, ''>;
}

/** Shows completed query Tool calls as one ordered transcript activity log. */
export function AgentQueryToolTrace({ variant }: AgentQueryToolTraceProps): React.JSX.Element {
  const steps = TOOL_STEPS[variant];
  return (
    <section aria-label="Tool activity" className={styles.toolTrace} data-parity="agent-query-tool-trace">
      <header className={styles.toolTraceHeader}>
        <span><Wrench aria-hidden="true" /><strong>Tool activity</strong></span>
        <small>{steps.length} completed</small>
      </header>
      <ol>
        {steps.map((step) => (
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