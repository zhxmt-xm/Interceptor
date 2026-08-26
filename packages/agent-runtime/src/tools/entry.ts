import { z } from 'zod';
import type {
  AgentTool,
  ToolExecutionContext,
  ToolExecutionResult,
} from '../interfaces';

export interface ToolDefinition<Input> {
  name: string;
  description: string;
  inputSchema: z.ZodType<Input>;
  execute(input: Input, context: ToolExecutionContext): unknown | Promise<unknown>;
}

export function defineTool<Input>(definition: ToolDefinition<Input>): AgentTool {
  return {
    descriptor: {
      name: definition.name,
      description: definition.description,
      inputSchema: z.toJSONSchema(definition.inputSchema) as Record<string, unknown>,
    },
    async execute(input, context): Promise<ToolExecutionResult> {
      const parsed = definition.inputSchema.safeParse(input);
      if (!parsed.success) {
        return {
          ok: false,
          error: `Invalid arguments for tool "${definition.name}".`,
          issues: parsed.error.issues.map((issue) => ({
            code: issue.code,
            path: issue.path,
            message: issue.message,
          })),
        };
      }

      try {
        return {
          ok: true,
          value: await definition.execute(parsed.data, context),
        };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error && error.message.length > 0
            ? error.message
            : `Tool "${definition.name}" failed.`,
        };
      }
    },
  };
}