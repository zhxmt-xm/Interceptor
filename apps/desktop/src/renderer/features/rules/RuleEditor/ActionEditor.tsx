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
import { useTranslation } from 'react-i18next';

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
  localizeOptions,
  PHASE_OPTIONS,
  QUERY_OP_OPTIONS,
  SCHEME_OPTIONS,
  TIMEOUT_POLICY_OPTIONS,
} from '../rule-format';
import styles from './ActionEditor.module.css';

interface ActionMeta {
  icon: typeof Code;
  tone: ActionTone;
  titleKey: string;
  subKey: string;
}

const ACTION_META: Record<RuleActionType, ActionMeta> = {
  header: { icon: Code, tone: 'rewrite', titleKey: 'rules.rewrite', subKey: 'rules.header' },
  query: { icon: Code, tone: 'rewrite', titleKey: 'rules.rewrite', subKey: 'rules.query' },
  body: { icon: FileText, tone: 'rewrite', titleKey: 'rules.rewrite', subKey: 'rules.body' },
  status: { icon: Code, tone: 'rewrite', titleKey: 'rules.status', subKey: 'rules.override' },
  synthetic: { icon: Reply, tone: 'block', titleKey: 'rules.synthetic', subKey: 'rules.response' },
  'map-local': { icon: MapPin, tone: 'map', titleKey: 'rules.mapLocal', subKey: 'rules.serveFile' },
  'map-remote': { icon: Globe, tone: 'remote', titleKey: 'rules.mapRemote', subKey: 'rules.reroute' },
  block: { icon: Ban, tone: 'block', titleKey: 'rules.block', subKey: 'rules.resetClose' },
  delay: { icon: Clock, tone: 'throttle', titleKey: 'rules.delay', subKey: 'rules.latency' },
  throttle: { icon: Gauge, tone: 'throttle', titleKey: 'rules.throttle', subKey: 'rules.bandwidth' },
  breakpoint: { icon: Pause, tone: 'brk', titleKey: 'rules.breakpoint', subKey: 'rules.pauseEdit' },
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
  const { t } = useTranslation();
  const translate = (key: string): string => t(key);
  const meta = ACTION_META[action.type];
  if (!meta) {
    return <span />;
  }
  return (
    <ActionCard icon={meta.icon} tone={meta.tone} title={t(meta.titleKey)} sub={t(meta.subKey)} onRemove={onRemove}>
      {renderBody(action, onChange, translate)}
    </ActionCard>
  );
}

function renderBody(
  action: RuleAction,
  onChange: (action: RuleAction) => void,
  translate: (key: string) => string,
): React.JSX.Element {
  switch (action.type) {
    case 'header': {
      const current = action;
      return (
        <div className={styles.row}>
          <Select
            className={styles.phase}
            ariaLabel={translate('rules.phase')}
            value={current.phase}
            options={localizeOptions(PHASE_OPTIONS, 'rules.phase', translate)}
            onValueChange={(phase) => onChange({ ...current, phase: phase as RulePhase })}
          />
          <Select
            className={styles.op}
            ariaLabel={translate('rules.operation')}
            value={current.op}
            options={localizeOptions(HEADER_OP_OPTIONS, 'rules.operation', translate)}
            onValueChange={(op) => onChange({ ...current, op: op as HeaderOperation })}
          />
          <InputBox
            className={styles.grow}
            ariaLabel={translate('rules.headerName')}
            value={current.name}
            placeholder="header-name"
            onValueChange={(name) => onChange({ ...current, name })}
          />
          {current.op !== 'remove' ? (
            <InputBox
              className={styles.grow}
              ariaLabel={translate('rules.headerValue')}
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
            ariaLabel={translate('rules.operation')}
            value={current.op}
            options={localizeOptions(QUERY_OP_OPTIONS, 'rules.operation', translate)}
            onValueChange={(op) => onChange({ ...current, op: op as 'set' | 'remove' })}
          />
          <InputBox
            className={styles.grow}
            ariaLabel={translate('rules.queryName')}
            value={current.name}
            placeholder="param"
            onValueChange={(name) => onChange({ ...current, name })}
          />
          {current.op !== 'remove' ? (
            <InputBox
              className={styles.grow}
              ariaLabel={translate('rules.queryValue')}
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
              ariaLabel={translate('rules.phase')}
              value={current.phase}
              options={localizeOptions(PHASE_OPTIONS, 'rules.phase', translate)}
              onValueChange={(phase) => onChange({ ...current, phase: phase as RulePhase })}
            />
            <Select
              className={styles.mode}
              ariaLabel={translate('rules.format')}
              value={current.format}
              options={localizeOptions(BODY_FORMAT_OPTIONS, 'rules.bodyFormat', translate)}
              onValueChange={(format) => onChange({ ...current, format: format as 'text' | 'json' })}
            />
          </div>
          <textarea
            className={styles.textarea}
            aria-label={translate('rules.bodyContent')}
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
            <span className={styles.label}>{translate('rules.status')}</span>
            <InputBox
              className={styles.num}
              ariaLabel={translate('rules.statusCode')}
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
                ariaLabel={translate('rules.headerName')}
                value={pair.name}
                placeholder="header-name"
                onValueChange={(name) =>
                  setHeaders(headers.map((item, position) =>
                    position === index ? { ...item, name } : item))
                }
              />
              <InputBox
                className={styles.grow}
                ariaLabel={translate('rules.headerValue')}
                value={pair.value}
                placeholder="value"
                onValueChange={(value) =>
                  setHeaders(headers.map((item, position) =>
                    position === index ? { ...item, value } : item))
                }
              />
              <IconButton
                icon={X}
                label={translate('rules.removeHeader')}
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
            {translate('rules.addHeader')}
          </button>
          <textarea
            className={styles.textarea}
            aria-label={translate('rules.responseBody')}
            value={current.body ?? ''}
            placeholder={translate('rules.responseBody')}
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
            ariaLabel={translate('rules.localPath')}
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
            ariaLabel={translate('rules.scheme')}
            value={current.scheme ?? ''}
            options={localizeOptions(SCHEME_OPTIONS, 'rules.scheme', translate)}
            onValueChange={(value) => rebuild('scheme', value)}
          />
          <InputBox
            className={styles.grow}
            ariaLabel={translate('rules.host')}
            value={current.host ?? ''}
            placeholder="staging.example.com"
            onValueChange={(value) => rebuild('host', value)}
          />
          <InputBox
            className={styles.num}
            ariaLabel={translate('rules.port')}
            type="number"
            value={current.port === undefined ? '' : String(current.port)}
            placeholder="port"
            onValueChange={(value) => rebuild('port', value)}
          />
          <InputBox
            className={styles.grow}
            ariaLabel={translate('rules.path')}
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
          <span className={styles.label}>{translate('rules.mode')}</span>
          <Select
            className={styles.mode}
            ariaLabel={translate('rules.blockMode')}
            value={current.mode}
            options={localizeOptions(BLOCK_MODE_OPTIONS, 'rules.blockMode', translate)}
            onValueChange={(mode) => onChange({ ...current, mode: mode as 'reset' | 'close' })}
          />
        </div>
      );
    }
    case 'status': {
      const current = action;
      return (
        <div className={styles.row}>
          <span className={styles.label}>{translate('rules.statusCode')}</span>
          <InputBox
            className={styles.num}
            ariaLabel={translate('rules.statusCode')}
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
            ariaLabel={translate('rules.phase')}
            value={current.phase}
            options={localizeOptions(PHASE_OPTIONS, 'rules.phase', translate)}
            onValueChange={(phase) => onChange({ ...current, phase: phase as RulePhase })}
          />
          <span className={styles.label}>{translate('rules.delayMs')}</span>
          <InputBox
            className={styles.num}
            ariaLabel={translate('rules.delayMilliseconds')}
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
            ariaLabel={translate('rules.phase')}
            value={current.phase}
            options={localizeOptions(PHASE_OPTIONS, 'rules.phase', translate)}
            onValueChange={(phase) => onChange({ ...current, phase: phase as RulePhase })}
          />
          <span className={styles.label}>{translate('rules.bytesPerSecond')}</span>
          <InputBox
            className={styles.num}
            ariaLabel={translate('rules.bytesPerSecond')}
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
            ariaLabel={translate('rules.phase')}
            value={current.phase}
            options={localizeOptions(PHASE_OPTIONS, 'rules.phase', translate)}
            onValueChange={(phase) => onChange({ ...current, phase: phase as RulePhase })}
          />
          <span className={styles.label}>{translate('rules.timeoutMs')}</span>
          <InputBox
            className={styles.num}
            ariaLabel={translate('rules.timeoutMilliseconds')}
            type="number"
            value={String(current.timeoutMs)}
            onValueChange={(value) =>
              onChange({ ...current, timeoutMs: toInt(value, current.timeoutMs) })
            }
          />
          <Select
            className={styles.mode}
            ariaLabel={translate('rules.onTimeout')}
            value={current.onTimeout}
            options={localizeOptions(TIMEOUT_POLICY_OPTIONS, 'rules.timeout', translate)}
            onValueChange={(value) => onChange({ ...current, onTimeout: value as 'continue' | 'drop' })}
          />
        </div>
      );
    }
    default:
      return <span />;
  }
}
