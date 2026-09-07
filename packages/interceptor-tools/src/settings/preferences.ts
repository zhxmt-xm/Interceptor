import { z } from 'zod';

import { InterceptorToolArgumentError } from '../arguments/entry';
import type { InterceptorToolContext, InterceptorToolDefinition, InterceptorToolJsonSchema } from '../interfaces';

const languageSchema = z.strictObject({ language: z.enum(['en', 'zh-CN', 'zh-TW', 'ja', 'ko', 'de', 'fr', 'es', 'it', 'pt-BR', 'ru', 'nl', 'pl', 'tr', 'uk']) });
const themeSchema = z.strictObject({ theme: z.enum(['warm', 'light', 'ember', 'dark']) });
const privacySchema = z.strictObject({ maskAuthorization: z.boolean(), maskCookies: z.boolean(), warnBeforeUnmasked: z.boolean() });

export function buildPreferenceTools(): readonly InterceptorToolDefinition[] {
  return [
    definePreferenceTool('settings_set_language', 'Change language', 'Apply and remember the selected UI language without changing other settings.', languageSchema, async (options, context) => {
      const { payload } = await context.host.invokeMain({ type: 'settings.language.set', payload: options }, context.abortSignal);
      return { language: payload.language };
    }),
    definePreferenceTool('settings_set_theme', 'Change theme', 'Apply and remember the selected UI theme without changing other settings.', themeSchema, async (options, context) => {
      const { payload } = await context.host.invokeMain({ type: 'settings.theme.set', payload: options }, context.abortSignal);
      return { theme: payload.theme };
    }),
    definePreferenceTool('settings_set_export_privacy_defaults', 'Set export privacy defaults', 'Save default masking and warning choices for future exports without modifying open export drafts or existing files.', privacySchema, async (options, context) => {
      const { payload } = await context.host.invokeMain({ type: 'settings.export-privacy-defaults.set', payload: options }, context.abortSignal);
      return { maskAuthorization: payload.maskAuthorization, maskCookies: payload.maskCookies, warnBeforeUnmasked: payload.warnBeforeUnmasked };
    }),
  ];
}

function definePreferenceTool<Schema extends z.ZodType<Record<string, string | boolean>>>(
  name: string,
  title: string,
  effectDescription: string,
  schema: Schema,
  change: (options: z.output<Schema>, context: InterceptorToolContext) => Promise<unknown>,
): InterceptorToolDefinition {
  const readOptions = (args: Readonly<Record<string, unknown>>): z.output<Schema> => {
    const parsed = schema.safeParse(args);
    if (!parsed.success) throw new InterceptorToolArgumentError('Invalid UI preference parameters.');
    return parsed.data;
  };
  return {
    name, title, description: effectDescription, effectDescription,
    capabilityId: 'settings', kind: 'change', destructive: false, openWorld: false,
    inputSchema: z.toJSONSchema(schema) as InterceptorToolJsonSchema,
    async describeChange(args, context) {
      const options = readOptions(args);
      context.abortSignal.throwIfAborted();
      return { lines: Object.entries(options).map(([key, value]) => `${key}: ${String(value)}`), metadata: options };
    },
    async execute(args, context) {
      const options = readOptions(args);
      context.abortSignal.throwIfAborted();
      try {
        const result = await change(options, context);
        context.abortSignal.throwIfAborted();
        return result;
      } catch {
        context.abortSignal.throwIfAborted();
        throw new Error('Unable to change the requested preference.');
      }
    },
  };
}