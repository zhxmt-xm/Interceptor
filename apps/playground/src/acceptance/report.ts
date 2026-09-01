import type { PlaygroundManualRecord } from '../interfaces';
import type { ObservedMcpExchange } from '../mcp/observed-fetch';
import { redactSensitiveText } from '../mcp/redaction';
import type { PlaygroundMcpConnection } from '../mcp/session';
import type { TrafficScenarioResult } from '../../server/interfaces.ts';
import { acceptanceRecipe } from './recipes';

export interface AcceptanceReportInput {
  readonly connection: PlaygroundMcpConnection;
  readonly endpoint: string;
  readonly exchanges: readonly ObservedMcpExchange[];
  readonly manualRecords: Readonly<Record<string, PlaygroundManualRecord>>;
  readonly token: string;
  readonly trafficResults: readonly TrafficScenarioResult[];
}

export interface AcceptanceReport {
  readonly endpoint: string;
  readonly exchanges: readonly ObservedMcpExchange[];
  readonly generatedAt: string;
  readonly protocol: string;
  readonly server: { readonly name: string; readonly version: string };
  readonly tools: readonly {
    readonly inputSchema: unknown;
    readonly name: string;
    readonly notes: string;
    readonly recipe: ReturnType<typeof acceptanceRecipe>;
    readonly schemaHash: string;
    readonly status: PlaygroundManualRecord['status'];
  }[];
  readonly traffic: readonly {
    readonly notes: string;
    readonly result: TrafficScenarioResult;
    readonly status: PlaygroundManualRecord['status'];
  }[];
}

export async function buildAcceptanceReport(
  input: AcceptanceReportInput,
): Promise<AcceptanceReport> {
  const report: AcceptanceReport = {
    endpoint: input.endpoint,
    exchanges: input.exchanges,
    generatedAt: new Date().toISOString(),
    protocol: input.connection.protocol,
    server: {
      name: input.connection.serverName,
      version: input.connection.serverVersion,
    },
    tools: await Promise.all(input.connection.tools.map(async (tool) => {
      const manual = input.manualRecords[tool.name] ?? { notes: '', status: 'not-run' };
      return {
        inputSchema: tool.inputSchema,
        name: tool.name,
        notes: manual.notes,
        recipe: acceptanceRecipe(tool.name),
        schemaHash: await sha256(stableJson(tool.inputSchema)),
        status: manual.status,
      };
    })),
    traffic: input.trafficResults.map((result) => {
      const manual = input.manualRecords[`traffic:${result.scenarioId}`]
        ?? { notes: '', status: 'not-run' };
      return { notes: manual.notes, result, status: manual.status };
    }),
  };
  return JSON.parse(redactSensitiveText(JSON.stringify(report), input.token)) as AcceptanceReport;
}

export function downloadAcceptanceReport(report: AcceptanceReport): void {
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.download = `interceptor-playground-${report.generatedAt.replaceAll(':', '-')}.json`;
  anchor.href = url;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (typeof value !== 'object' || value === null) return JSON.stringify(value);
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`;
}