import { useEffect, useRef, useState } from 'react';

import { ConnectionPanel } from './components/ConnectionPanel';
import { PlaygroundCatalog } from './components/PlaygroundCatalog';
import { PlaygroundHeader } from './components/PlaygroundHeader';
import { PlaygroundInspector } from './components/PlaygroundInspector';
import { PlaygroundWorkbench } from './components/PlaygroundWorkbench';
import type {
  PlaygroundConnectionState,
  PlaygroundManualRecord,
  PlaygroundSection,
  PlaygroundToolRun,
} from './interfaces';
import { parseMcpConfiguration, type PlaygroundMcpConfiguration } from './mcp/config';
import type { ObservedMcpExchange } from './mcp/observed-fetch';
import {
  PlaygroundMcpSession,
  type PlaygroundMcpConnection,
  type PlaygroundMcpTool,
} from './mcp/session';
import { AbortableAttempts } from './utils/abortable-attempts';
import styles from './App.module.css';
import type {
  TrafficScenarioDescriptor,
  TrafficScenarioId,
  TrafficScenarioResult,
} from '../server/interfaces.ts';
import { buildAcceptanceReport, downloadAcceptanceReport } from './acceptance/report';

const EMPTY_RUN: PlaygroundToolRun = { state: 'idle' };
const EMPTY_MANUAL_RECORD: PlaygroundManualRecord = { notes: '', status: 'not-run' };

export function App(): React.JSX.Element {
  const [section, setSection] = useState<PlaygroundSection>('mcp');
  const [configuration, setConfiguration] = useState<PlaygroundMcpConfiguration | null>(null);
  const [connection, setConnection] = useState<PlaygroundMcpConnection | null>(null);
  const [connectionState, setConnectionState] = useState<PlaygroundConnectionState>('disconnected');
  const [connectionError, setConnectionError] = useState('');
  const [tools, setTools] = useState<readonly PlaygroundMcpTool[]>([]);
  const [selectedToolName, setSelectedToolName] = useState('');
  const [argumentsText, setArgumentsText] = useState('{}');
  const [exchanges, setExchanges] = useState<readonly ObservedMcpExchange[]>([]);
  const [selectedExchangeId, setSelectedExchangeId] = useState('');
  const [run, setRun] = useState<PlaygroundToolRun>(EMPTY_RUN);
  const [manualRecords, setManualRecords] = useState<Record<string, PlaygroundManualRecord>>({});
  const [trafficScenarios, setTrafficScenarios] = useState<readonly TrafficScenarioDescriptor[]>([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState<TrafficScenarioId>('h1-json');
  const [trafficResult, setTrafficResult] = useState<TrafficScenarioResult | null>(null);
  const [trafficResults, setTrafficResults] = useState<readonly TrafficScenarioResult[]>([]);
  const [trafficRunning, setTrafficRunning] = useState(false);
  const sessionRef = useRef<PlaygroundMcpSession | null>(null);
  const connectionAttemptsRef = useRef(new AbortableAttempts());
  const toolCallAttemptsRef = useRef(new AbortableAttempts());

  useEffect(() => {
    void fetch('/api/traffic/scenarios')
      .then((response) => response.json() as Promise<TrafficScenarioDescriptor[]>)
      .then(setTrafficScenarios)
      .catch((error: unknown) => setConnectionError(
        error instanceof Error ? error.message : String(error),
      ));
  }, []);

  useEffect(() => () => {
    connectionAttemptsRef.current.invalidate();
    toolCallAttemptsRef.current.invalidate();
    void sessionRef.current?.close();
  }, []);

  const selectedTool = tools.find((tool) => tool.name === selectedToolName) ?? tools[0];
  const manualRecordKey = section === 'mcp'
    ? selectedTool?.name ?? ''
    : `traffic:${selectedScenarioId}`;
  const manualRecord = manualRecords[manualRecordKey] ?? EMPTY_MANUAL_RECORD;

  const recordExchange = (exchange: ObservedMcpExchange): void => {
    setExchanges((current) => {
      const index = current.findIndex((item) => item.id === exchange.id);
      if (index < 0) return [exchange, ...current];
      return current.map((item) => item.id === exchange.id ? exchange : item);
    });
    setSelectedExchangeId(exchange.id);
  };

  const connect = async (text: string): Promise<void> => {
    toolCallAttemptsRef.current.invalidate();
    const attempt = connectionAttemptsRef.current.start();
    setConnectionState('connecting');
    setConnectionError('');
    setRun(EMPTY_RUN);
    try {
      const nextConfiguration = parseMcpConfiguration(text);
      setConfiguration(nextConfiguration);
      const previousSession = sessionRef.current;
      sessionRef.current = null;
      await previousSession?.close().catch(() => undefined);
      if (!connectionAttemptsRef.current.isCurrent(attempt.id)) return;
      const opened = await PlaygroundMcpSession.connect(
        nextConfiguration,
        (exchange) => {
          if (connectionAttemptsRef.current.isCurrent(attempt.id)) recordExchange(exchange);
        },
        attempt.signal,
      );
      if (!connectionAttemptsRef.current.isCurrent(attempt.id)) {
        await opened.session.close().catch(() => undefined);
        return;
      }
      sessionRef.current = opened.session;
      setConnection(opened.connection);
      setTools(opened.connection.tools);
      setSelectedToolName(opened.connection.tools[0]?.name ?? '');
      setConnectionState('connected');
    } catch (error) {
      if (!connectionAttemptsRef.current.isCurrent(attempt.id)) return;
      setConnection(null);
      setTools([]);
      setConnectionError(error instanceof Error ? error.message : String(error));
      setConnectionState('error');
    } finally {
      connectionAttemptsRef.current.finish(attempt.id);
    }
  };

  const reconnect = async (): Promise<void> => {
    if (configuration === null) return;
    await connect(JSON.stringify({
      servers: {
        interceptor: {
          type: 'http',
          url: configuration.endpoint,
          headers: { Authorization: `Bearer ${configuration.token}` },
        },
      },
    }));
  };

  const disconnect = async (): Promise<void> => {
    connectionAttemptsRef.current.invalidate();
    toolCallAttemptsRef.current.invalidate();
    await sessionRef.current?.close().catch(() => undefined);
    sessionRef.current = null;
    setConnection(null);
    setTools([]);
    setSelectedToolName('');
    setConnectionState('disconnected');
    setRun(EMPTY_RUN);
  };

  const clearConfiguration = async (): Promise<void> => {
    await disconnect();
    setConfiguration(null);
    setConnectionError('');
    setExchanges([]);
    setSelectedExchangeId('');
  };

  const refreshTools = async (): Promise<void> => {
    if (sessionRef.current === null) return;
    try {
      const nextTools = await sessionRef.current.refreshTools();
      setTools(nextTools);
      if (!nextTools.some((tool) => tool.name === selectedToolName)) {
        setSelectedToolName(nextTools[0]?.name ?? '');
      }
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : String(error));
    }
  };

  const callTool = async (): Promise<void> => {
    if (sessionRef.current === null || selectedTool === undefined) return;
    let args: unknown;
    try {
      args = JSON.parse(argumentsText);
    } catch {
      setRun({ error: 'Arguments must be valid JSON.', state: 'failed', tool: selectedTool });
      return;
    }
    if (typeof args !== 'object' || args === null || Array.isArray(args)) {
      setRun({ error: 'Arguments must be a JSON object.', state: 'failed', tool: selectedTool });
      return;
    }
    const attempt = toolCallAttemptsRef.current.start();
    setRun({ state: 'running', tool: selectedTool });
    setManualRecords((current) => ({
      ...current,
      [selectedTool.name]: { ...current[selectedTool.name], status: 'not-run', notes: current[selectedTool.name]?.notes ?? '' },
    }));
    try {
      const result = await sessionRef.current.callTool(
        selectedTool.name,
        args as Readonly<Record<string, unknown>>,
        attempt.signal,
      );
      if (!toolCallAttemptsRef.current.isCurrent(attempt.id)) return;
      setRun({ result, state: 'complete', tool: selectedTool });
    } catch (error) {
      if (!toolCallAttemptsRef.current.isCurrent(attempt.id)) return;
      setRun({
        error: error instanceof Error ? error.message : String(error),
        state: attempt.signal.aborted ? 'aborted' : 'failed',
        tool: selectedTool,
      });
    } finally {
      toolCallAttemptsRef.current.finish(attempt.id);
    }
  };

  const runTrafficScenario = async (): Promise<void> => {
    setTrafficRunning(true);
    setTrafficResult(null);
    setManualRecords((current) => ({
      ...current,
      [`traffic:${selectedScenarioId}`]: {
        notes: current[`traffic:${selectedScenarioId}`]?.notes ?? '',
        status: 'not-run',
      },
    }));
    try {
      const response = await fetch('/api/traffic/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proxyPort: 8888, scenarioId: selectedScenarioId }),
      });
      const result = await response.json() as TrafficScenarioResult | { error: string };
      if (!response.ok || !('scenarioId' in result)) {
        throw new Error('error' in result ? result.error : `Traffic Lab returned HTTP ${response.status}.`);
      }
      setTrafficResult(result);
      setTrafficResults((current) => [result, ...current]);
    } catch (error) {
      const failedResult: TrafficScenarioResult = {
        attempt: { method: 'GET', path: '', url: '' },
        durationMs: 0,
        error: error instanceof Error ? error.message : String(error),
        request: null,
        scenarioId: selectedScenarioId,
        startedAt: new Date().toISOString(),
        state: 'failed',
      };
      setTrafficResult(failedResult);
      setTrafficResults((current) => [failedResult, ...current]);
    } finally {
      setTrafficRunning(false);
    }
  };

  const exportReport = async (): Promise<void> => {
    if (connection === null || configuration === null) return;
    const report = await buildAcceptanceReport({
      connection,
      endpoint: configuration.endpoint,
      exchanges,
      manualRecords,
      token: configuration.token,
      trafficResults,
    });
    downloadAcceptanceReport(report);
  };

  const selectedExchange = exchanges.find((exchange) => exchange.id === selectedExchangeId)
    ?? exchanges[0];

  return (
    <main className={styles.playgroundApp}>
      <PlaygroundHeader
        connection={connection}
        connectionState={connectionState}
        endpoint={configuration?.endpoint ?? ''}
        onClearConfiguration={() => void clearConfiguration()}
        onExportReport={() => void exportReport()}
        onReconnect={() => void reconnect()}
      />
      <div className={styles.playgroundBody}>
        <PlaygroundCatalog
          section={section}
          selectedScenarioId={selectedScenarioId}
          selectedToolName={selectedTool?.name ?? ''}
          trafficScenarios={trafficScenarios}
          tools={tools}
          onRefreshTools={() => void refreshTools()}
          onSectionChange={setSection}
          onSelectScenario={(scenarioId) => {
            setSelectedScenarioId(scenarioId);
            setTrafficResult(null);
          }}
          onSelectTool={(name) => {
            setSelectedToolName(name);
            setArgumentsText('{}');
            setRun(EMPTY_RUN);
          }}
        />
        {section === 'traffic' || connectionState === 'connected' && selectedTool !== undefined ? (
          <PlaygroundWorkbench
            argumentsText={argumentsText}
            run={run}
            section={section}
            tool={selectedTool}
            trafficResult={trafficResult}
            trafficRunning={trafficRunning}
            trafficScenario={trafficScenarios.find((scenario) => scenario.id === selectedScenarioId)}
            onAbort={() => toolCallAttemptsRef.current.abortCurrent()}
            onArgumentsChange={setArgumentsText}
            onCall={() => void callTool()}
            onRunTraffic={() => void runTrafficScenario()}
          />
        ) : (
          <ConnectionPanel
            error={connectionError}
            state={connectionState}
            onConnect={(text) => void connect(text)}
          />
        )}
        <PlaygroundInspector
          exchange={selectedExchange}
          exchanges={exchanges}
          manualRecord={manualRecord}
          run={run}
          section={section}
          trafficResult={trafficResult}
          onClearExchanges={() => {
            setExchanges([]);
            setSelectedExchangeId('');
          }}
          onManualRecordChange={(record) => {
            if (manualRecordKey.length === 0) return;
            setManualRecords((current) => ({ ...current, [manualRecordKey]: record }));
          }}
          onSelectExchange={setSelectedExchangeId}
        />
      </div>
    </main>
  );
}