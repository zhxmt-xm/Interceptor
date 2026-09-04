import { randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';

import {
  INTERCEPTOR_TOOL_NAMES,
  buildInterceptorToolSettingsGroups,
} from '@interceptor/tools';

import type { ToolCapabilitySettingsSnapshot } from '../../shared/desktop-api';

interface ToolCapabilitySettingsRecord {
  readonly agentDisabledToolNames: readonly string[];
  readonly mcpDisabledToolNames: readonly string[];
}

const SETTINGS_MAX_BYTES = 256 * 1024;

/** Owns global Agent/MCP Tool exposure settings and their atomic persistence. */
export class ToolCapabilitySettingsService {
  readonly #settingsPath: string;
  readonly #groups = buildInterceptorToolSettingsGroups();
  readonly #toolNames = new Set<string>(INTERCEPTOR_TOOL_NAMES);
  #agentDisabledToolNames: readonly string[] = [];
  #mcpDisabledToolNames: readonly string[] = [];
  #mutationQueue: Promise<void> = Promise.resolve();

  constructor(settingsPath: string) {
    this.#settingsPath = settingsPath;
  }

  /** Loads and validates the persisted record before Renderer intents are registered. */
  async start(): Promise<void> {
    const record = await this.#readRecord();
    this.#agentDisabledToolNames = this.#normalizeNames(record?.agentDisabledToolNames ?? []);
    this.#mcpDisabledToolNames = this.#normalizeNames(record?.mcpDisabledToolNames ?? []);
  }

  /** Returns a detached complete snapshot for Renderer Settings. */
  snapshot(): ToolCapabilitySettingsSnapshot {
    return structuredClone({
      groups: this.#groups,
      agentDisabledToolNames: this.#agentDisabledToolNames,
      mcpDisabledToolNames: this.#mcpDisabledToolNames,
    });
  }

  /** Stops exposing one Tool to the internal Agent. */
  disableAgentTool(toolName: string): Promise<ToolCapabilitySettingsSnapshot> {
    return this.#changeToolExposure('agent', toolName, false);
  }

  /** Restores one Tool to the internal Agent. */
  enableAgentTool(toolName: string): Promise<ToolCapabilitySettingsSnapshot> {
    return this.#changeToolExposure('agent', toolName, true);
  }

  /** Stops exposing one Tool to MCP clients. */
  disableMcpTool(toolName: string): Promise<ToolCapabilitySettingsSnapshot> {
    return this.#changeToolExposure('mcp', toolName, false);
  }

  /** Restores one Tool to MCP clients. */
  enableMcpTool(toolName: string): Promise<ToolCapabilitySettingsSnapshot> {
    return this.#changeToolExposure('mcp', toolName, true);
  }

  /** Serializes one exposure mutation and commits memory only after persistence succeeds. */
  #changeToolExposure(
    target: 'agent' | 'mcp',
    toolName: string,
    enabled: boolean,
  ): Promise<ToolCapabilitySettingsSnapshot> {
    if (!this.#toolNames.has(toolName)) {
      return Promise.reject(new Error(`Unknown Tool "${toolName}".`));
    }
    const operation = this.#mutationQueue.then(async () => {
      const agentDisabledToolNames = new Set(this.#agentDisabledToolNames);
      const mcpDisabledToolNames = new Set(this.#mcpDisabledToolNames);
      const disabledToolNames = target === 'agent'
        ? agentDisabledToolNames
        : mcpDisabledToolNames;
      if (enabled) {
        disabledToolNames.delete(toolName);
      } else {
        disabledToolNames.add(toolName);
      }
      const nextAgentDisabledToolNames = this.#normalizeNames([...agentDisabledToolNames]);
      const nextMcpDisabledToolNames = this.#normalizeNames([...mcpDisabledToolNames]);
      await this.#writeRecord(nextAgentDisabledToolNames, nextMcpDisabledToolNames);
      this.#agentDisabledToolNames = nextAgentDisabledToolNames;
      this.#mcpDisabledToolNames = nextMcpDisabledToolNames;
    });
    this.#mutationQueue = operation.then(() => undefined, () => undefined);
    return operation.then(() => this.snapshot());
  }

  /** Reads one bounded regular-file settings record. */
  async #readRecord(): Promise<ToolCapabilitySettingsRecord | null> {
    let metadata;
    try {
      metadata = await lstat(this.#settingsPath);
    } catch (error) {
      if (ToolCapabilitySettingsService.#isMissing(error)) return null;
      throw error;
    }
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new Error('Tool capability settings must be a regular file.');
    }
    if (metadata.size > SETTINGS_MAX_BYTES) {
      throw new Error('Tool capability settings exceed the size limit.');
    }
    let value: unknown;
    try {
      value = JSON.parse(await readFile(this.#settingsPath, 'utf8'));
    } catch {
      throw new Error('Tool capability settings contain invalid JSON.');
    }
    return this.#parseRecord(value);
  }

  /** Atomically writes disabled names, or removes an all-enabled record. */
  async #writeRecord(
    agentDisabledToolNames: readonly string[],
    mcpDisabledToolNames: readonly string[],
  ): Promise<void> {
    if (agentDisabledToolNames.length === 0 && mcpDisabledToolNames.length === 0) {
      await rm(this.#settingsPath, { force: true });
      return;
    }
    const directory = path.dirname(this.#settingsPath);
    const temporaryPath = path.join(
      directory,
      `.${path.basename(this.#settingsPath)}.${randomUUID()}.tmp`,
    );
    await mkdir(directory, { recursive: true });
    try {
      const file = await open(temporaryPath, 'wx', 0o600);
      try {
        await file.writeFile(JSON.stringify({
          agentDisabledToolNames,
          mcpDisabledToolNames,
        }), 'utf8');
        await file.sync();
      } finally {
        await file.close();
      }
      await rename(temporaryPath, this.#settingsPath);
    } catch (error) {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  /** Deduplicates known names into executable registry order. */
  #normalizeNames(names: readonly string[]): readonly string[] {
    const namesToKeep = new Set(names.filter((name) => this.#toolNames.has(name)));
    return INTERCEPTOR_TOOL_NAMES.filter((name) => namesToKeep.has(name));
  }

  /** Validates the complete persisted settings envelope. */
  #parseRecord(value: unknown): ToolCapabilitySettingsRecord {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new Error('Tool capability settings fields are invalid.');
    }
    const record = value as Record<string, unknown>;
    const expectedKeys = ['agentDisabledToolNames', 'mcpDisabledToolNames'];
    if (
      !ToolCapabilitySettingsService.#areUniqueNames(record.agentDisabledToolNames)
      || !ToolCapabilitySettingsService.#areUniqueNames(record.mcpDisabledToolNames)
      || Object.keys(record).some((key) => !expectedKeys.includes(key))
    ) {
      throw new Error('Tool capability settings fields are invalid.');
    }
    return {
      agentDisabledToolNames: record.agentDisabledToolNames,
      mcpDisabledToolNames: record.mcpDisabledToolNames,
    };
  }

  /** Accepts unique string names; start() drops names absent from the current registry. */
  static #areUniqueNames(value: unknown): value is string[] {
    return Array.isArray(value)
      && value.every((name) => typeof name === 'string')
      && new Set(value).size === value.length;
  }

  /** Identifies an expected missing-file read. */
  static #isMissing(error: unknown): boolean {
    return typeof error === 'object'
      && error !== null
      && 'code' in error
      && (error as { code?: unknown }).code === 'ENOENT';
  }
}