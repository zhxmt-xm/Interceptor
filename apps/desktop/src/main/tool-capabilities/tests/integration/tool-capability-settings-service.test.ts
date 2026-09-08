import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ToolCapabilitySettingsService } from '../../entry';

describe('ToolCapabilitySettingsService', () => {
  const temporaryDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map((directory) => (
      rm(directory, { recursive: true, force: true })
    )));
  });

  it('defaults every registry Tool to enabled without creating a settings file', async () => {
    const { service, settingsPath } = await createService(temporaryDirectories);

    expect(service.snapshot()).toMatchObject({
      agentDisabledToolNames: [],
      mcpDisabledToolNames: [],
    });
    expect(service.snapshot().groups.flatMap((group) => group.tools)).toHaveLength(62);
    await expect(readFile(settingsPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('persists Agent and MCP disabled names independently across service instances', async () => {
    const { service, settingsPath } = await createService(temporaryDirectories);

    await service.disableAgentTool('capture_get_proxy_status');
    await service.disableMcpTool('rules_replace_tree');

    expect(service.snapshot()).toMatchObject({
      agentDisabledToolNames: ['capture_get_proxy_status'],
      mcpDisabledToolNames: ['rules_replace_tree'],
    });
    expect(JSON.parse(await readFile(settingsPath, 'utf8'))).toEqual({
      agentDisabledToolNames: ['capture_get_proxy_status'],
      mcpDisabledToolNames: ['rules_replace_tree'],
    });

    const restored = new ToolCapabilitySettingsService(settingsPath);
    await restored.start();
    expect(restored.snapshot()).toMatchObject({
      agentDisabledToolNames: ['capture_get_proxy_status'],
      mcpDisabledToolNames: ['rules_replace_tree'],
    });

    await restored.enableAgentTool('capture_get_proxy_status');
    await restored.enableMcpTool('rules_replace_tree');
    await expect(readFile(settingsPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('drops obsolete stored names without migrating them', async () => {
    const directory = await createTemporaryDirectory(temporaryDirectories);
    const settingsPath = path.join(directory, 'tool-capabilities', 'settings.json');
    await mkdir(path.dirname(settingsPath), { recursive: true });
    await writeFile(settingsPath, JSON.stringify({
      agentDisabledToolNames: ['get_exchange', 'capture_get_exchange'],
      mcpDisabledToolNames: ['query_diagnostics', 'diagnostics_query'],
    }), 'utf8');
    const service = new ToolCapabilitySettingsService(settingsPath);

    await service.start();

    expect(service.snapshot()).toMatchObject({
      agentDisabledToolNames: ['capture_get_exchange'],
      mcpDisabledToolNames: ['diagnostics_query'],
    });
    expect(JSON.parse(await readFile(settingsPath, 'utf8'))).toEqual({
      agentDisabledToolNames: ['get_exchange', 'capture_get_exchange'],
      mcpDisabledToolNames: ['query_diagnostics', 'diagnostics_query'],
    });
  });

  it('rejects duplicate stored names', async () => {
    const directory = await createTemporaryDirectory(temporaryDirectories);
    const settingsPath = path.join(directory, 'tool-capabilities', 'settings.json');
    await mkdir(path.dirname(settingsPath), { recursive: true });
    await writeFile(settingsPath, JSON.stringify({
      agentDisabledToolNames: ['capture_get_exchange', 'capture_get_exchange'],
      mcpDisabledToolNames: [],
    }), 'utf8');

    await expect(new ToolCapabilitySettingsService(settingsPath).start())
      .rejects.toThrow('fields are invalid');
  });

  it('serializes concurrent mutations without losing independent changes', async () => {
    const { service } = await createService(temporaryDirectories);

    await Promise.all([
      service.disableAgentTool('capture_get_proxy_status'),
      service.disableAgentTool('capture_get_exchange'),
      service.disableMcpTool('rules_replace_tree'),
    ]);

    expect(service.snapshot()).toMatchObject({
      agentDisabledToolNames: ['capture_get_proxy_status', 'capture_get_exchange'],
      mcpDisabledToolNames: ['rules_replace_tree'],
    });
  });

  it('rejects unknown mutations and invalid persisted records before changing state', async () => {
    const { service } = await createService(temporaryDirectories);

    await expect(service.disableAgentTool('not_a_tool')).rejects.toThrow('Unknown Tool');
    expect(service.snapshot().agentDisabledToolNames).toEqual([]);

    const directory = await createTemporaryDirectory(temporaryDirectories);
    const settingsPath = path.join(directory, 'tool-capabilities', 'settings.json');
    await mkdir(path.dirname(settingsPath), { recursive: true });
    await writeFile(settingsPath, JSON.stringify({
      agentDisabledToolNames: 'capture_get_exchange',
      mcpDisabledToolNames: [],
    }), 'utf8');

    await expect(new ToolCapabilitySettingsService(settingsPath).start())
      .rejects.toThrow('fields are invalid');
  });
});

async function createService(
  temporaryDirectories: string[],
): Promise<{ service: ToolCapabilitySettingsService; settingsPath: string }> {
  const directory = await createTemporaryDirectory(temporaryDirectories);
  const settingsPath = path.join(directory, 'tool-capabilities', 'settings.json');
  const service = new ToolCapabilitySettingsService(settingsPath);
  await service.start();
  return { service, settingsPath };
}

async function createTemporaryDirectory(temporaryDirectories: string[]): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'interceptor-tool-capabilities-'));
  temporaryDirectories.push(directory);
  return directory;
}