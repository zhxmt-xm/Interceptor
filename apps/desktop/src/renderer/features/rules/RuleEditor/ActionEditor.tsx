import {
  Ban,
  Clock,
  Code,
  FileText,
  Gauge,
  Globe,
  MapPin,
  Pause,
  Plus,
  Reply,
  X,
} from 'lucide-react';

import { IconButton, InputBox, Select } from '../../../components';
import type {
  HeaderOperation,
  RuleAction,
  RuleActionType,
  RuleHeaderPair,
  RulePhase,
} from '../../../../shared/desktop-api';
import { ActionCard, type ActionTone } from '../ActionCard/ActionCard';
import {
  BLOCK_MODE_OPTIONS,
  BODY_FORMAT_OPTIONS,
  HEADER_OP_OPTIONS,
  PHASE_OPTIONS,
  QUERY_OP_OPTIONS,
  SCHEME_OPTIONS,
  TIMEOUT_POLICY_OPTIONS,
} from '../rule-format';
import styles from './ActionEditor.module.css';

interface ActionMeta {
  icon: typeof Code;
  tone: ActionTone;
  title: string;
  sub: string;
}

const ACTION_META: Record<RuleActionType, ActionMeta> = {
  header: { icon: Code, tone: 'rewrite', title: 'Rewrite', sub: 'header' },
  query: { icon: Code, tone: 'rewrite', title: 'Rewrite', sub: 'query' },
  body: { icon: FileText, tone: 'rewrite', title: 'Rewrite', sub: 'body' },
  status: { icon: Code, tone: 'rewrite', title: 'Status', sub: 'override' },
  synthetic: { icon: Reply, tone: 'block', title: 'Synthetic', sub: 'response' },
  'map-local': { icon: MapPin, tone: 'map', title: 'Map Local', sub: 'serve file' },
  'map-remote': { icon: Globe, tone: 'remote', title: 'Map Remote', sub: 'reroute' },
  block: { icon: Ban, tone: 'block', title: 'Block', sub: 'reset / close' },
  delay: { icon: Clock, tone: 'throttle', title: 'Delay', sub: 'latency' },
  throttle: { icon: Gauge, tone: 'throttle', title: 'Throttle', sub: 'bandwidth' },
  breakpoint: { icon: Pause, tone: 'brk', title: 'Breakpoint', sub: 'pause & edit' },
};

function toInt(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export interface ActionEditorProps {
  action: RuleAction;
  onChange: (action: RuleAction) => void;
  onRemove: () => void;
}

/** 单个 action 卡片：按类型渲染完整编辑表单；名/值/正文自由输入，操作/相位为枚举。 */
export function ActionEditor({
  action,
  onChange,
  onRemove,
}: ActionEditorProps): React.JSX.Element {
  const meta = ACTION_META[action.type];
  if (!meta) {
    return <span />;
  }
  return (
    <ActionCard icon={meta.icon} tone={meta.tone} title={meta.title} sub={meta.sub} onRemove={onRemove}>
      {renderBody(action, onChange)}
    </ActionCard>
  );
}

function renderBody(
  action: RuleAction,
  onChange: (action: RuleAction) => void,
): React.JSX.Element {
  switch (action.type) {
    case 'header': {
      const current = action;
      return (
        <div className={styles.row}>
          <Select
            className={styles.phase}
            ariaLabel="Phase"
            value={current.phase}
            options={PHASE_OPTIONS}
            onValueChange={(phase) => onChange({ ...current, phase: phase as RulePhase })}
          />
          <Select
            className={styles.op}
            ariaLabel="Operation"
            value={current.op}
            options={HEADER_OP_OPTIONS}
            onValueChange={(op) => onChange({ ...current, op: op as HeaderOperation })}
          />
          <InputBox
            className={styles.grow}
            ariaLabel="Header name"
            value={current.name}
            placeholder="header-name"
            onValueChange={(name) => onChange({ ...current, name })}
          />
          {current.op !== 'remove' ? (
            <InputBox
              className={styles.grow}
              ariaLabel="Header value"
              value={current.value ?? ''}
              placeholder="value"
              onValueChange={(value) => onChange({ ...current, value })}
            />
          ) : null}
        </div>
      );
    }
    case 'query': {
      const current = action;
      return (
        <div className={styles.row}>
          <Select
            className={styles.op}
            ariaLabel="Operation"
            value={current.op}
            options={QUERY_OP_OPTIONS}
            onValueChange={(op) => onChange({ ...current, op: op as 'set' | 'remove' })}
          />
          <InputBox
            className={styles.grow}
            ariaLabel="Query name"
            value={current.name}
            placeholder="param"
            onValueChange={(name) => onChange({ ...current, name })}
          />
          {current.op !== 'remove' ? (
            <InputBox
              className={styles.grow}
              ariaLabel="Query value"
              value={current.value ?? ''}
              placeholder="value"
              onValueChange={(value) => onChange({ ...current, value })}
            />
          ) : null}
        </div>
      );
    }
    case 'body': {
      const current = action;
      return (
        <div className={styles.stack}>
          <div className={styles.row}>
            <Select
              className={styles.phase}
              ariaLabel="Phase"
              value={current.phase}
              options={PHASE_OPTIONS}
              onValueChange={(phase) => onChange({ ...current, phase: phase as RulePhase })}
            />
            <Select
              className={styles.mode}
              ariaLabel="Format"
              value={current.format}
              options={BODY_FORMAT_OPTIONS}
              onValueChange={(format) => onChange({ ...current, format: format as 'text' | 'json' })}
            />
          </div>
          <textarea
            className={styles.textarea}
            aria-label="Body content"
            value={current.content}
            spellCheck={false}
            onChange={(event) => onChange({ ...current, content: event.target.value })}
          />
        </div>
      );
    }
    case 'synthetic': {
      const current = action;
      const headers = current.headers ?? [];
      const setHeaders = (next: RuleHeaderPair[]): void =>
        onChange({ ...current, headers: next });
      return (
        <div className={styles.stack}>
          <div className={styles.row}>
            <span className={styles.label}>Status</span>
            <InputBox
              className={styles.num}
              ariaLabel="Status code"
              type="number"
              value={String(current.statusCode)}
              onValueChange={(value) =>
                onChange({ ...current, statusCode: toInt(value, current.statusCode) })
              }
            />
          </div>
          {headers.map((pair, index) => (
            <div className={styles.row} key={index}>
              <InputBox
                className={styles.grow}
                ariaLabel="Header name"
                value={pair.name}
                placeholder="header-name"
                onValueChange={(name) =>
                  setHeaders(headers.map((item, position) =>
                    position === index ? { ...item, name } : item))
                }
              />
              <InputBox
                className={styles.grow}
                ariaLabel="Header value"
                value={pair.value}
                placeholder="value"
                onValueChange={(value) =>
                  setHeaders(headers.map((item, position) =>
                    position === index ? { ...item, value } : item))
                }
              />
              <IconButton
                icon={X}
                label="Remove header"
                size="sm"
                strokeWidth={2.2}
                onClick={() => setHeaders(headers.filter((_, position) => position !== index))}
              />
            </div>
          ))}
          <button
            type="button"
            className={styles.addSmall}
            onClick={() => setHeaders([...headers, { name: '', value: '' }])}
          >
            <Plus size={12} strokeWidth={2} />
            Add header
          </button>
          <textarea
            className={styles.textarea}
            aria-label="Response body"
            value={current.body ?? ''}
            placeholder="response body"
            spellCheck={false}
            onChange={(event) => onChange({ ...current, body: event.target.value })}
          />
        </div>
      );
    }
    case 'map-local': {
      const current = action;
      return (
        <div className={styles.row}>
          <InputBox
            className={styles.grow}
            ariaLabel="Local path"
            value={current.path}
            placeholder="/absolute/path/or/dir"
            onValueChange={(path) => onChange({ ...current, path })}
          >
            <FileText size={14} strokeWidth={1.9} />
          </InputBox>
        </div>
      );
    }
    case 'map-remote': {
      const current = action;
      const rebuild = (
        field: 'scheme' | 'host' | 'port' | 'path',
        raw: string,
      ): void => {
        const draft = {
          scheme: current.scheme,
          host: current.host,
          port: current.port,
          path: current.path,
        };
        if (field === 'scheme') {
          draft.scheme = raw === '' ? undefined : (raw as 'http' | 'https');
        } else if (field === 'port') {
          draft.port = raw === '' ? undefined : toInt(raw, 0);
        } else {
          draft[field] = raw === '' ? undefined : raw;
        }
        onChange({
          type: 'map-remote',
          ...(draft.scheme ? { scheme: draft.scheme } : {}),
          ...(draft.host ? { host: draft.host } : {}),
          ...(draft.port ? { port: draft.port } : {}),
          ...(draft.path ? { path: draft.path } : {}),
        });
      };
      return (
        <div className={styles.row}>
          <Select
            className={styles.mode}
            ariaLabel="Scheme"
            value={current.scheme ?? ''}
            options={SCHEME_OPTIONS}
            onValueChange={(value) => rebuild('scheme', value)}
          />
          <InputBox
            className={styles.grow}
            ariaLabel="Host"
            value={current.host ?? ''}
            placeholder="staging.example.com"
            onValueChange={(value) => rebuild('host', value)}
          />
          <InputBox
            className={styles.num}
            ariaLabel="Port"
            type="number"
            value={current.port === undefined ? '' : String(current.port)}
            placeholder="port"
            onValueChange={(value) => rebuild('port', value)}
          />
          <InputBox
            className={styles.grow}
            ariaLabel="Path"
            value={current.path ?? ''}
            placeholder="/new/path"
            onValueChange={(value) => rebuild('path', value)}
          />
        </div>
      );
    }
    case 'block': {
      const current = action;
      return (
        <div className={styles.row}>
          <span className={styles.label}>Mode</span>
          <Select
            className={styles.mode}
            ariaLabel="Block mode"
            value={current.mode}
            options={BLOCK_MODE_OPTIONS}
            onValueChange={(mode) => onChange({ ...current, mode: mode as 'reset' | 'close' })}
          />
        </div>
      );
    }
    case 'status': {
      const current = action;
      return (
        <div className={styles.row}>
          <span className={styles.label}>Status code</span>
          <InputBox
            className={styles.num}
            ariaLabel="Status code"
            type="number"
            value={String(current.statusCode)}
            onValueChange={(value) =>
              onChange({ ...current, statusCode: toInt(value, current.statusCode) })
            }
          />
        </div>
      );
    }
    case 'delay': {
      const current = action;
      return (
        <div className={styles.row}>
          <Select
            className={styles.phase}
            ariaLabel="Phase"
            value={current.phase}
            options={PHASE_OPTIONS}
            onValueChange={(phase) => onChange({ ...current, phase: phase as RulePhase })}
          />
          <span className={styles.label}>Delay (ms)</span>
          <InputBox
            className={styles.num}
            ariaLabel="Delay milliseconds"
            type="number"
            value={String(current.ms)}
            onValueChange={(value) => onChange({ ...current, ms: toInt(value, current.ms) })}
          />
        </div>
      );
    }
    case 'throttle': {
      const current = action;
      return (
        <div className={styles.row}>
          <Select
            className={styles.phase}
            ariaLabel="Phase"
            value={current.phase}
            options={PHASE_OPTIONS}
            onValueChange={(phase) => onChange({ ...current, phase: phase as RulePhase })}
          />
          <span className={styles.label}>Bytes / s</span>
          <InputBox
            className={styles.num}
            ariaLabel="Bytes per second"
            type="number"
            value={String(current.bytesPerSecond)}
            onValueChange={(value) =>
              onChange({ ...current, bytesPerSecond: toInt(value, current.bytesPerSecond) })
            }
          />
        </div>
      );
    }
    case 'breakpoint': {
      const current = action;
      return (
        <div className={styles.row}>
          <Select
            className={styles.phase}
            ariaLabel="Phase"
            value={current.phase}
            options={PHASE_OPTIONS}
            onValueChange={(phase) => onChange({ ...current, phase: phase as RulePhase })}
          />
          <span className={styles.label}>Timeout (ms)</span>
          <InputBox
            className={styles.num}
            ariaLabel="Timeout milliseconds"
            type="number"
            value={String(current.timeoutMs)}
            onValueChange={(value) =>
              onChange({ ...current, timeoutMs: toInt(value, current.timeoutMs) })
            }
          />
          <Select
            className={styles.mode}
            ariaLabel="On timeout"
            value={current.onTimeout}
            options={TIMEOUT_POLICY_OPTIONS}
            onValueChange={(value) => onChange({ ...current, onTimeout: value as 'continue' | 'drop' })}
          />
        </div>
      );
    }
    default:
      return <span />;
  }
}
