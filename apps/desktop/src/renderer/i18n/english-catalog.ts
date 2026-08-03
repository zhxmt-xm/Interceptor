import { captureEnglishMessages } from './capture-resources';
import { commonEnglishMessages } from './common-resources';
import { composerBreakpointsEnglishMessages } from './composer-breakpoints-resources';
import { diagnosticsEnglishMessages } from './diagnostics-resources';
import { firstRunEnglishMessages } from './first-run-resources';
import { rulesEnglishMessages } from './rules-resources';
import { settingsEnglishMessages } from './settings-resources';

export const englishCatalog = {
  ...commonEnglishMessages,
  ...captureEnglishMessages,
  ...rulesEnglishMessages,
  ...composerBreakpointsEnglishMessages,
  ...diagnosticsEnglishMessages,
  ...firstRunEnglishMessages,
  ...settingsEnglishMessages,
} as const;

export type MessageKey = keyof typeof englishCatalog;
type MultiPluralBase = 'capture.exportRequestCount' | 'rules.issueCount' | 'rules.conditionCount';
type MultiPluralKey =
  | `${MultiPluralBase}_${'few' | 'many'}`
  | `capture.showMore_${'one' | 'few' | 'many'}`;

export type MessageCatalog = Record<MessageKey, string> &
  Partial<Record<MultiPluralKey, string>>;