import type { TimelineEntry } from '../../components';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type Outcome = 'ok' | 'fail' | 'cx' | 'to';

export interface LogRow {
  time: string;
  command: string;
  level: LogLevel;
  outcome: Outcome;
  outcomeLabel: string;
  duration: string;
}

export const LOGS: LogRow[] = [
  { time: '12:00:01.234', command: 'core:echo', level: 'info', outcome: 'ok', outcomeLabel: 'success', duration: '2 ms' },
  { time: '12:00:02.100', command: 'rules:apply', level: 'info', outcome: 'ok', outcomeLabel: 'success', duration: '18 ms' },
  { time: '12:00:03.450', command: 'capture:query', level: 'debug', outcome: 'ok', outcomeLabel: 'success', duration: '5 ms' },
  { time: '12:00:04.100', command: 'body:decode', level: 'warn', outcome: 'to', outcomeLabel: 'timed_out', duration: '1.2 s' },
  { time: '12:00:05.000', command: 'breakpoint:continue', level: 'info', outcome: 'ok', outcomeLabel: 'success', duration: '0 ms' },
  { time: '12:00:06.200', command: 'export:har', level: 'info', outcome: 'cx', outcomeLabel: 'cancelled', duration: '340 ms' },
  { time: '12:00:07.100', command: 'rules:compile', level: 'error', outcome: 'fail', outcomeLabel: 'failed', duration: '12 ms' },
  { time: '12:00:08.640', command: 'storage:flush', level: 'debug', outcome: 'ok', outcomeLabel: 'success', duration: '33 ms' },
];

export const TIMELINE: TimelineEntry[] = [
  { label: 'received', time: '0.0 ms', width: 4 },
  { label: 'validated', time: '0.4 ms', width: 8 },
  { label: 'handler.started', time: '0.6 ms', width: 12 },
  { label: 'query.started', time: '0.8 ms', width: 16 },
  { label: 'query.completed', time: '4.2 ms', width: 84 },
  { label: 'response.sent', time: '4.8 ms', width: 96 },
  { label: 'completed', time: '5.0 ms', width: 100 },
];
