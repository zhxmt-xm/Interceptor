import { Check, CircleSlash2, Trash2, X } from 'lucide-react';

import type { PlaygroundManualRecord, PlaygroundSection, PlaygroundToolRun } from '../interfaces';
import type { ObservedMcpExchange } from '../mcp/observed-fetch';
import type { TrafficScenarioResult } from '../../server/interfaces.ts';
import styles from './PlaygroundInspector.module.css';

interface PlaygroundInspectorProps {
  readonly exchange?: ObservedMcpExchange;
  readonly exchanges: readonly ObservedMcpExchange[];
  readonly manualRecord: PlaygroundManualRecord;
  readonly run: PlaygroundToolRun;
  readonly section: PlaygroundSection;
  readonly trafficResult: TrafficScenarioResult | null;
  readonly onClearExchanges: () => void;
  readonly onManualRecordChange: (record: PlaygroundManualRecord) => void;
  readonly onSelectExchange: (id: string) => void;
}

export function PlaygroundInspector({ exchange, exchanges, manualRecord, run, section, trafficResult, onClearExchanges, onManualRecordChange, onSelectExchange }: PlaygroundInspectorProps): React.JSX.Element {
  const isTraffic = section === 'capture';
  return (
    <aside className={styles.playgroundInspector} data-response-detail>
      <header><div><strong>Response Detail</strong><span>{isTraffic ? 'Origin and client facts' : `${exchanges.length} observed exchanges`}</span></div>{isTraffic ? <code>{trafficResult?.state ?? 'not run'}</code> : <><select aria-label="Observed exchange" value={exchange?.id ?? ''} onChange={(event) => onSelectExchange(event.target.value)}><option value="">No exchange</option>{exchanges.map((item) => <option key={item.id} value={item.id}>{item.request.method} · {item.response?.status ?? item.state} · {item.durationMs} ms</option>)}</select><button aria-label="Clear exchanges" disabled={exchanges.length === 0} type="button" onClick={onClearExchanges}><Trash2 aria-hidden="true" /></button></>}</header>
      <div className={styles.playgroundInspectorScroll}>
        {isTraffic ? renderTraffic(trafficResult) : exchange ? <><section><h2>Request</h2><dl><div><dt>Method</dt><dd>{exchange.request.method}</dd></div><div><dt>Duration</dt><dd>{exchange.durationMs} ms</dd></div><div><dt>URL</dt><dd>{exchange.request.url}</dd></div></dl><pre>{formatHeaders(exchange.request.headers)}{exchange.request.body ? `\n\n${exchange.request.body}` : ''}</pre></section><section><h2>Response</h2><pre>{exchange.response ? `HTTP ${exchange.response.status}\n${formatHeaders(exchange.response.headers)}\n\n${exchange.response.body}` : exchange.error ?? 'Waiting for response…'}</pre></section></> : <div className={styles.playgroundEmpty}>Connect or call a Tool to inspect the raw exchange.</div>}
        {!isTraffic && run.result ? <section><h2>SDK result</h2><pre>{JSON.stringify(run.result, null, 2)}</pre></section> : null}
        <section><h2>Manual result</h2><div className={styles.playgroundManualStatus}><button aria-pressed={manualRecord.status === 'pass'} data-state="pass" type="button" onClick={() => onManualRecordChange({ ...manualRecord, status: 'pass' })}><Check aria-hidden="true" />Pass</button><button aria-pressed={manualRecord.status === 'fail'} data-state="fail" type="button" onClick={() => onManualRecordChange({ ...manualRecord, status: 'fail' })}><X aria-hidden="true" />Fail</button><button aria-pressed={manualRecord.status === 'blocked'} data-state="blocked" type="button" onClick={() => onManualRecordChange({ ...manualRecord, status: 'blocked' })}><CircleSlash2 aria-hidden="true" />Blocked</button></div><textarea aria-label="Manual notes" placeholder="What did you observe in Interceptor and at the origin?" value={manualRecord.notes} onChange={(event) => onManualRecordChange({ ...manualRecord, notes: event.target.value })} /></section>
      </div>
    </aside>
  );
}

function formatHeaders(headers: Readonly<Record<string, string>>): string {
  return Object.entries(headers).map(([name, value]) => `${name}: ${value}`).join('\n');
}

function renderTraffic(result: TrafficScenarioResult | null): React.JSX.Element {
  if (result === null) return <div className={styles.playgroundEmpty}>Run a scenario to inspect origin and client facts.</div>;
  const isConnect = result.attempt.method === 'CONNECT';
  return <><section><h2>Protocol</h2><dl><div><dt>Protocol</dt><dd>{result.protocol}</dd></div><div><dt>Duration</dt><dd>{result.durationMs} ms</dd></div>{result.tls ? <><div><dt>ALPN</dt><dd>{result.tls.alpn}</dd></div><div><dt>Cipher</dt><dd>{result.tls.cipher}</dd></div></> : null}</dl>{result.events ? <pre>{JSON.stringify(result.events, null, 2)}</pre> : null}</section><section><h2>{isConnect ? 'Proxy CONNECT request' : 'Origin request'}</h2>{result.request ? <><dl><div><dt>Method</dt><dd>{result.request.method}</dd></div><div><dt>URL</dt><dd>{result.request.url}</dd></div><div><dt>Body</dt><dd>{result.request.bodyBytes} bytes · {result.request.bodyEncoding ?? 'utf8'}</dd></div></dl><pre>{formatHeaders(result.request.headers)}{result.request.body ? `\n\n${result.request.body}` : ''}</pre></> : <pre>{isConnect ? 'Proxy did not receive this CONNECT request.' : 'Origin did not receive this request.'}\nAttempted {result.attempt.method} {result.attempt.url}</pre>}</section><section><h2>{isConnect ? 'Proxy CONNECT response' : 'Client response'}</h2><pre>{result.response ? `HTTP ${result.response.statusCode}\n${formatHeaders(result.response.headers)}\n\n${result.response.body}\n\nbody: ${result.response.bodyBytes} bytes · ${result.response.bodyEncoding}\nchunk timings: ${result.response.chunkTimingsMs.join(', ')} ms${result.response.trailers ? `\ntrailers:\n${formatHeaders(result.response.trailers)}` : ''}` : result.error ?? 'No response'}</pre></section></>;
}