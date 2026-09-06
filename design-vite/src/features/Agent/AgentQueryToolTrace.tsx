import { CheckCircle2, Wrench } from 'lucide-react';

import type { AgentToolTraceState } from '../../state/types';
import styles from './AgentQueryToolTrace.module.css';

const TOOL_STEPS = {
  capture: [
    { name: 'discover_tools', arguments: 'capabilityId: capture', result: '10 tools discovered' },
    { name: 'capture_get_storage_status', arguments: 'No parameters', result: 'Exchanges 1 · Bodies 2 · 184 B' },
    { name: 'capture_get_proxy_status', arguments: 'No parameters', result: 'Recording on · 127.0.0.1:8888' },
    { name: 'capture_list_exchanges', arguments: 'limit: 50', result: '1 matching exchange' },
    { name: 'capture_get_exchange', arguments: 'exchangeId: e2e-agent-traffic', result: 'GET /agent-e2e/traffic · 200' },
  ],
  'body-messages': [
    { name: 'discover_tools', arguments: 'capabilityId: capture', result: '10 tools discovered' },
    { name: 'capture_get_exchange', arguments: 'exchangeId: body-json', result: 'POST /playground/body/json · 200' },
    { name: 'capture_get_exchange_body', arguments: 'exchangeId: body-json · bodyId: body-1 · length: 65536', result: '14 B · complete' },
    { name: 'capture_list_websocket_messages', arguments: 'exchangeId: ws-bidirectional', result: '2 messages · complete' },
    { name: 'capture_list_grpc_messages', arguments: 'exchangeId: grpc-unary-json · side: response · limit: 200', result: 'response · 1 message · complete' },
  ],
  breakpoints: [
    { name: 'discover_tools', arguments: 'capabilityId: breakpoints', result: '8 tools discovered' },
    { name: 'breakpoints_list', arguments: 'No parameters', result: 'Pending breakpoints: 1 · Enabled' },
    { name: 'breakpoints_disable_http', arguments: 'No parameters', result: 'Disabled' },
    { name: 'breakpoints_enable_http', arguments: 'No parameters', result: 'Enabled' },
    { name: 'breakpoints_continue', arguments: 'breakpointId: bp-agent-request', result: 'Continued · bp-agent-request' },
  ],
  composer: [
    { name: 'discover_tools', arguments: 'capabilityId: composer', result: '2 tools discovered' },
    { name: 'composer_probe_connection', arguments: 'host: 127.0.0.1 · port: 43128 · timeoutMs: 5000', result: 'TLSv1.3 · h2 · Certificates 1' },
    { name: 'composer_probe_connection', arguments: 'host: 127.0.0.1 · port: 43129 · timeoutMs: 2000', result: 'TLS probe failed · connect ECONNREFUSED' },
  ],
  rules: [
    { name: 'discover_tools', arguments: 'capabilityId: rules', result: '5 tools discovered' },
    { name: 'rules_get_tree', arguments: 'No parameters', result: 'Revision 1 · Rules 1 · Enabled 1' },
    { name: 'rules_get_hits', arguments: 'No parameters', result: 'Rules 1 · Hits 1' },
  ],
  diagnostics: [
    { name: 'discover_tools', arguments: 'capabilityId: diagnostics', result: '1 tools discovered' },
    { name: 'diagnostics_query', arguments: 'process: core · command: composer.send · outcome: success · limit: 10', result: 'Records 4 · Completed · Dropped 0' },
  ],
  settings: [
    { name: 'discover_tools', arguments: 'capabilityId: settings', result: '12 tools discovered' },
    { name: 'settings_get_core_process_status', arguments: 'No parameters', result: 'Core running · PID 42' },
    { name: 'settings_get_system_proxy_status', arguments: 'No parameters', result: 'Owned by Interceptor' },
    { name: 'settings_get_certificate_status', arguments: 'No parameters', result: 'Not generated · HTTPS Disabled' },
    { name: 'settings_get_tls_insecure_hosts', arguments: 'No parameters', result: 'Hosts 1' },
    { name: 'settings_get_tls_passthrough', arguments: 'No parameters', result: 'Revision 1 · Hosts 1' },
    { name: 'settings_list_app_containers', arguments: 'No parameters', result: 'Apps 138 · Exempt 1' },
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
        {steps.map((step, index) => (
          <li data-tool-name={step.name} key={`${step.name}-${index}`}>
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