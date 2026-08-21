import { FileText, Plus, X } from 'lucide-react';

import type {
  HeaderOperation,
  RuleAction,
  RuleHeaderPair,
  RulePhase,
} from '../../../../shared/desktop-api';
import { AutomationIdFactory } from '../../../../shared/automation-ids';
import { IconButton, InputBox, Select, Switch } from '../../../components';
import {
  BLOCK_MODE_OPTIONS,
  BODY_FORMAT_OPTIONS,
  HEADER_OP_OPTIONS,
  PHASE_OPTIONS,
  QUERY_OP_OPTIONS,
  SCHEME_OPTIONS,
} from '../constants';
import { localizeOptions, toInt } from '../utils';
import { BreakpointActionBody } from './BreakpointActionBody';

import styles from './ActionBody.module.css';

export interface ActionBodyProps {
  ruleId: string;
  index: number;
  action: RuleAction;
  onChange: (action: RuleAction) => void;
  onValidityChange: (valid: boolean) => void;
  translate: (key: string) => string;
}

/** 按动作类型渲染对应的受控表单主体。 */
export function ActionBody({
  ruleId,
  index,
  action,
  onChange,
  onValidityChange,
  translate,
}: ActionBodyProps): React.JSX.Element {
  switch (action.type) {
    case 'header': {
      const current = action;
      return (
        <div className={styles.row}>
          <Select
            className={styles.phase}
            ariaLabel={translate('rules.phase')}
            automationId={AutomationIdFactory.ruleActionField(ruleId, index, 'phase')}
            value={current.phase}
            options={localizeOptions(PHASE_OPTIONS, 'rules.phase', translate).map((option) => ({
              ...option,
              automationId: AutomationIdFactory.ruleActionField(
                ruleId,
                index,
                `phase-option.${option.value}`,
              ),
            }))}
            onValueChange={(phase) => onChange({ ...current, phase: phase as RulePhase })}
          />
          <Select
            className={styles.op}
            ariaLabel={translate('rules.operation')}
            automationId={AutomationIdFactory.ruleActionField(ruleId, index, 'operation')}
            value={current.op}
            options={localizeOptions(HEADER_OP_OPTIONS, 'rules.operation', translate).map(
              (option) => ({
                ...option,
                automationId: AutomationIdFactory.ruleActionField(
                  ruleId,
                  index,
                  `operation-option.${option.value}`,
                ),
              }),
            )}
            onValueChange={(op) => onChange({ ...current, op: op as HeaderOperation })}
          />
          <InputBox
            className={styles.grow}
            ariaLabel={translate('rules.headerName')}
            automationId={AutomationIdFactory.ruleActionField(ruleId, index, 'name')}
            value={current.name}
            placeholder="header-name"
            onValueChange={(name) => onChange({ ...current, name })}
          />
          {current.op !== 'remove' ? (
            <InputBox
              className={styles.grow}
              ariaLabel={translate('rules.headerValue')}
              automationId={AutomationIdFactory.ruleActionField(ruleId, index, 'value')}
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
              automationId={AutomationIdFactory.ruleActionField(ruleId, index, 'phase')}
              value={current.phase}
              options={localizeOptions(PHASE_OPTIONS, 'rules.phase', translate).map((option) => ({
                ...option,
                automationId: AutomationIdFactory.ruleActionField(
                  ruleId,
                  index,
                  `phase-option.${option.value}`,
                ),
              }))}
              onValueChange={(phase) => onChange({ ...current, phase: phase as RulePhase })}
            />
            <Select
              className={styles.mode}
              ariaLabel={translate('rules.format')}
              automationId={AutomationIdFactory.ruleActionField(ruleId, index, 'format')}
              value={current.format}
              options={localizeOptions(BODY_FORMAT_OPTIONS, 'rules.bodyFormat', translate).map(
                (option) => ({
                  ...option,
                  automationId: AutomationIdFactory.ruleActionField(
                    ruleId,
                    index,
                    `format-option.${option.value}`,
                  ),
                }),
              )}
              onValueChange={(format) => onChange({ ...current, format: format as 'text' | 'json' })}
            />
          </div>
          <textarea
            className={styles.textarea}
            aria-label={translate('rules.bodyContent')}
            data-automation-id={AutomationIdFactory.ruleActionField(ruleId, index, 'content')}
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
    case 'breakpoint': {
      return (
        <BreakpointActionBody
          action={action}
          index={index}
          ruleId={ruleId}
          translate={translate}
          onChange={onChange}
          onValidityChange={onValidityChange}
        />
      );
    }
    default:
      return <span />;
  }
}
