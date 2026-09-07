import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';

import { ConnectionPanel } from '../mcp/ConnectionPanel';
import { PlaygroundCatalog } from './components/PlaygroundCatalog';
import { PlaygroundHeader } from './components/PlaygroundHeader';
import { PlaygroundInspector } from './components/PlaygroundInspector';
import { PlaygroundNavigation } from './components/PlaygroundNavigation';
import { PlaygroundWorkbench } from './components/PlaygroundWorkbench';
import type {
  PlaygroundConnectionState,
  PlaygroundManualRecord,
  PlaygroundSection,
  PlaygroundToolRun,
} from './interfaces';
import { parseMcpConfiguration, type PlaygroundMcpConfiguration } from '../mcp/config';
import type { ObservedMcpExchange } from '../mcp/observed-fetch';
import {
  PlaygroundMcpSession,
  type PlaygroundMcpConnection,
  type PlaygroundMcpTool,
} from '../mcp/session';
import { AbortableAttempts } from './abortable-attempts';
import styles from './App.module.css';
import type {
  TrafficScenarioDescriptor,
  TrafficScenarioId,
  TrafficScenarioResult,
} from '../../server/scenarios/interfaces.ts';
import { buildAcceptanceReport, downloadAcceptanceReport } from '../acceptance/report';
import {
  clampPlaygroundDetailWidth,
  createTrafficRequestDraftJson,
  parseTrafficRequestDraftJson,
  protocolForTrafficRequestDraft,
} from '../capture/workspace';

const EMPTY_RUN: PlaygroundToolRun = { state: 'idle' };
const EMPTY_MANUAL_RECORD: PlaygroundManualRecord = { notes: '', status: 'not-run' };

export function App(): React.JSX.Element {
  const [section, setSection] = useState<PlaygroundSection>('capture');
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
  const [trafficDraftText, setTrafficDraftText] = useState('');
  const [trafficDraftError, setTrafficDraftError] = useState('');
  const [trafficResult, setTrafficResult] = useState<TrafficScenarioResult | null>(null);
  const [trafficResults, setTrafficResults] = useState<readonly TrafficScenarioResult[]>([]);
  const [trafficRunning, setTrafficRunning] = useState(false);
  const [detailWidths, setDetailWidths] = useState<Readonly<Record<PlaygroundSection, number>>>({
    capture: 560,
    mcp: 560,
  });
  const pageBodyRef = useRef<HTMLDivElement>(null);
  const splitterDragRef = useRef<{ readonly pointerId: number; readonly startWidth: number; readonly startX: number } | null>(null);
  const sessionRef = useRef<PlaygroundMcpSession | null>(null);
  const connectionAttemptsRef = useRef(new AbortableAttempts());
  const trafficRunAttemptsRef = useRef(new AbortableAttempts());
  const toolCallAttemptsRef = useRef(new AbortableAttempts());

  useEffect(() => {
    void fetch('/api/traffic/scenarios')
      .then((response) => response.json() as Promise<TrafficScenarioDescriptor[]>)
      .then((scenarios) => {
        setTrafficScenarios(scenarios);
        const firstScenario = scenarios.find((scenario) => scenario.id === 'h1-json') ?? scenarios[0];
        if (firstScenario !== undefined) {
          setSelectedScenarioId(firstScenario.id);
          setTrafficDraftText(createTrafficRequestDraftJson(firstScenario.defaultDraft));
        }
      })
      .catch((error: unknown) => setConnectionError(
        error instanceof Error ? error.message : String(error),
      ));
  }, []);

  useEffect(() => () => {
    connectionAttemptsRef.current.invalidate();
    trafficRunAttemptsRef.current.invalidate();
    toolCallAttemptsRef.current.invalidate();
    void sessionRef.current?.close();
  }, []);

  const selectedTool = tools.find((tool) => tool.name === selectedToolName) ?? tools[0];
  const selectedTrafficScenario = trafficScenarios.find((scenario) => scenario.id === selectedScenarioId);
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
        toolCallAttemptsRef.current.invalidate();
        setSelectedToolName(nextTools[0]?.name ?? '');
        setRun(EMPTY_RUN);
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
    let draft;
    try {
      draft = parseTrafficRequestDraftJson(trafficDraftText);
      setTrafficDraftError('');
    } catch (error) {
      setTrafficDraftError(error instanceof Error ? error.message : String(error));
      return;
    }
    const attempt = trafficRunAttemptsRef.current.start();
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
        body: JSON.stringify({ draft, proxyPort: 8888, scenarioId: selectedScenarioId }),
        signal: attempt.signal,
      });
      const result = await response.json() as TrafficScenarioResult | { error: string };
      if (!trafficRunAttemptsRef.current.isCurrent(attempt.id)) return;
      if (!response.ok || !('scenarioId' in result)) {
        throw new Error('error' in result ? result.error : `Traffic Lab returned HTTP ${response.status}.`);
      }
      setTrafficResult(result);
      setTrafficResults((current) => [result, ...current]);
    } catch (error) {
      if (!trafficRunAttemptsRef.current.isCurrent(attempt.id)) return;
      const failedResult: TrafficScenarioResult = {
        attempt: { method: 'GET', path: '', url: '' },
        durationMs: 0,
        error: error instanceof Error ? error.message : String(error),
        protocol: protocolForTrafficRequestDraft(draft),
        request: null,
        scenarioId: selectedScenarioId,
        startedAt: new Date().toISOString(),
        state: 'failed',
      };
      setTrafficResult(failedResult);
      setTrafficResults((current) => [failedResult, ...current]);
    } finally {
      const isCurrent = trafficRunAttemptsRef.current.isCurrent(attempt.id);
      trafficRunAttemptsRef.current.finish(attempt.id);
      if (isCurrent) setTrafficRunning(false);
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
  const detailWidth = detailWidths[section];
  const detailWidthStyle = { '--playground-detail-width': `${detailWidth}px` } as CSSProperties;

  const resetTrafficRequest = (): void => {
    if (selectedTrafficScenario === undefined) return;
    setTrafficDraftText(createTrafficRequestDraftJson(selectedTrafficScenario.defaultDraft));
    setTrafficDraftError('');
    setTrafficResult(null);
  };

  const resizeDetailFromPointer = (event: PointerEvent<HTMLDivElement>): void => {
    if (splitterDragRef.current?.pointerId !== event.pointerId || pageBodyRef.current === null) return;
    const requestedWidth = splitterDragRef.current.startWidth + splitterDragRef.current.startX - event.clientX;
    const width = clampPlaygroundDetailWidth(requestedWidth, pageBodyRef.current.clientWidth);
    setDetailWidths((current) => ({ ...current, [section]: width }));
  };

  const resizeDetailFromKeyboard = (event: KeyboardEvent<HTMLDivElement>): void => {
    if ((event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') || pageBodyRef.current === null) return;
    event.preventDefault();
    const requestedWidth = detailWidth + (event.key === 'ArrowLeft' ? 24 : -24);
    const width = clampPlaygroundDetailWidth(requestedWidth, pageBodyRef.current.clientWidth);
    setDetailWidths((current) => ({ ...current, [section]: width }));
  };

  return (
    <main className={styles.playgroundApp} data-section={section}>
      <PlaygroundNavigation connectionState={connectionState} scenarioCount={trafficScenarios.length} section={section} onSectionChange={setSection} />
      <section className={styles.playgroundPage}>
        <PlaygroundHeader
          connection={connection}
          connectionState={connectionState}
          endpoint={configuration?.endpoint ?? ''}
          section={section}
          trafficRunning={trafficRunning}
          trafficScenario={selectedTrafficScenario}
          onClearConfiguration={() => void clearConfiguration()}
          onExportReport={() => void exportReport()}
          onReconnect={() => void reconnect()}
          onResetRequest={resetTrafficRequest}
          onRunTraffic={() => void runTrafficScenario()}
        />
        <div className={styles.playgroundBody} ref={pageBodyRef} style={detailWidthStyle}>
          <PlaygroundCatalog
            section={section}
            selectedScenarioId={selectedScenarioId}
            selectedToolName={selectedTool?.name ?? ''}
            trafficScenarios={trafficScenarios}
            tools={tools}
            onRefreshTools={() => void refreshTools()}
            onSelectScenario={(scenarioId) => {
              const scenario = trafficScenarios.find((item) => item.id === scenarioId);
              if (scenario === undefined) return;
              trafficRunAttemptsRef.current.invalidate();
              setTrafficRunning(false);
              setSelectedScenarioId(scenarioId);
              setTrafficDraftText(createTrafficRequestDraftJson(scenario.defaultDraft));
              setTrafficDraftError('');
              setTrafficResult(null);
            }}
            onSelectTool={(name) => {
              toolCallAttemptsRef.current.invalidate();
              setSelectedToolName(name);
              setArgumentsText('{}');
              setRun(EMPTY_RUN);
            }}
          />
          {section === 'capture' || connectionState === 'connected' && selectedTool !== undefined ? (
            <PlaygroundWorkbench
              argumentsText={argumentsText}
              draftError={trafficDraftError}
              draftText={trafficDraftText}
              run={run}
              section={section}
              tool={selectedTool}
              trafficResult={trafficResult}
              trafficRunning={trafficRunning}
              trafficScenario={selectedTrafficScenario}
              onAbort={() => toolCallAttemptsRef.current.abortCurrent()}
              onArgumentsChange={setArgumentsText}
              onCall={() => void callTool()}
              onDraftChange={(value) => {
                setTrafficDraftText(value);
                setTrafficDraftError('');
              }}
            />
          ) : (
            <ConnectionPanel error={connectionError} state={connectionState} onConnect={(text) => void connect(text)} />
          )}
          <div
            aria-label="Resize Response Detail"
            aria-orientation="vertical"
            aria-valuemin={360}
            aria-valuenow={detailWidth}
            className={styles.playgroundSplitter}
            role="separator"
            tabIndex={0}
            onKeyDown={resizeDetailFromKeyboard}
            onPointerDown={(event) => {
              splitterDragRef.current = { pointerId: event.pointerId, startWidth: detailWidth, startX: event.clientX };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={resizeDetailFromPointer}
            onPointerUp={(event) => {
              if (splitterDragRef.current?.pointerId === event.pointerId) splitterDragRef.current = null;
              event.currentTarget.releasePointerCapture(event.pointerId);
            }}
          ><span /></div>
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
      </section>
    </main>
  );
}