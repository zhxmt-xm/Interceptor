import type { SelectOption } from '../../components';

/** 目录行高，菜单锚在触发行下方。 */
export const FOLDER_ROW_HEIGHT = 30;

/** 目录操作菜单宽度，用于右对齐。 */
export const FOLDER_MENU_WIDTH = 190;

export const MATCHER_TYPE_OPTIONS: SelectOption[] = [
  { value: 'method', label: 'Method' },
  { value: 'host', label: 'Host' },
  { value: 'path', label: 'Path' },
  { value: 'url', label: 'URL' },
  { value: 'query', label: 'Query' },
  { value: 'header', label: 'Header' },
  { value: 'status', label: 'Status' },
  { value: 'mime', label: 'MIME' },
];

export const PHASE_OPTIONS: SelectOption[] = [
  { value: 'request', label: 'request' },
  { value: 'response', label: 'response' },
];

export const HEADER_OP_OPTIONS: SelectOption[] = [
  { value: 'set', label: 'Set' },
  { value: 'append', label: 'Append' },
  { value: 'remove', label: 'Remove' },
];

export const QUERY_OP_OPTIONS: SelectOption[] = [
  { value: 'set', label: 'Set' },
  { value: 'remove', label: 'Remove' },
];

export const BODY_FORMAT_OPTIONS: SelectOption[] = [
  { value: 'text', label: 'text' },
  { value: 'json', label: 'JSON' },
];

export const BLOCK_MODE_OPTIONS: SelectOption[] = [
  { value: 'reset', label: 'reset' },
  { value: 'close', label: 'close' },
];

export const SCHEME_OPTIONS: SelectOption[] = [
  { value: '', label: 'keep' },
  { value: 'http', label: 'http' },
  { value: 'https', label: 'https' },
];

export const TIMEOUT_POLICY_OPTIONS: SelectOption[] = [
  { value: 'continue', label: 'continue' },
  { value: 'drop', label: 'drop' },
];
