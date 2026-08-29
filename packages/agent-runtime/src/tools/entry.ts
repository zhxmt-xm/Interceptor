import { z } from 'zod';
import type {
  AgentTool,
  ToolExecutionContext,
  ToolExecutionResult,
} from '../interfaces';

/**
 * Defines one Tool from a single Zod schema and validated executor.
 * 使用同一份 Zod schema 与校验后执行器定义一个 Tool。
 */
export interface ToolDefinition<Input> {
  name: string;
  description: string;
  inputSchema: z.ZodType<Input>;
  /**
   * Executes only arguments that have passed the declared Zod schema.
   * 只执行已经通过所声明 Zod schema 的参数。
   */
  execute(input: Input, context: ToolExecutionContext): unknown | Promise<unknown>;
}

/**
 * Marks a Tool failure that the model can inspect and correct.
 * 标记模型可以查看并修正的 Tool 失败。
 */
export class ToolExecutionError extends Error {
  /** Stable domain error code returned to the model. / 返回给模型的稳定领域错误码。 */
  readonly code: string;

  /**
   * Creates an explicit recoverable Tool error.
   * 创建一个显式可恢复的 Tool 错误。
   */
  constructor(code: string, message: string) {
    super(message);
    this.name = 'ToolExecutionError';
    this.code = code;
  }
}

/**
 * Builds a model descriptor and an executor that validates all untrusted arguments.
 * 构造模型 descriptor，并让执行器校验所有不可信参数。
 */
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
          error: {
            code: 'invalid_arguments',
            message: `Invalid arguments for tool "${definition.name}".`,
          },
          issues: parsed.error.issues.map((issue) => ({
            code: issue.code,
            path: issue.path,
            message: issue.message,
          })),
        };
      }

      // Only explicit domain errors become Tool Results; unknown implementation errors fail the Turn.
      // 只有显式领域错误会转换为 Tool Result；未知实现异常会让 Turn 失败。
      try {
        return {
          ok: true,
          value: await definition.execute(parsed.data, context),
        };
      } catch (error) {
        if (error instanceof ToolExecutionError) {
          return {
            ok: false,
            error: {
              code: error.code,
              message: error.message,
            },
          };
        }
        throw error;
      }
    },
  };
}