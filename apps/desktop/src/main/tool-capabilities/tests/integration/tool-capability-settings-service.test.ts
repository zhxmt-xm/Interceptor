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
    expect(service.snapshot().groups.flatMap((group) => group.tools)).toHaveLength(24);
    await expect(readFile(settingsPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('persists Agent and MCP disabled names independently across service instances', async () => {
    const { service, settingsPath } = await createService(temporaryDirectories);

    await service.disableAgentTool('get_proxy_status');
    await service.disableMcpTool('apply_rules');

    expect(service.snapshot()).toMatchObject({
      agentDisabledToolNames: ['get_proxy_status'],
      mcpDisabledToolNames: ['apply_rules'],
    });
    expect(JSON.parse(await readFile(settingsPath, 'utf8'))).toEqual({
      agentDisabledToolNames: ['get_proxy_status'],
      mcpDisabledToolNames: ['apply_rules'],
    });

    const restored = new ToolCapabilitySettingsService(settingsPath);
    await restored.start();
    expect(restored.snapshot()).toMatchObject({
      agentDisabledToolNames: ['get_proxy_status'],
      mcpDisabledToolNames: ['apply_rules'],
    });

    await restored.enableAgentTool('get_proxy_status');
    await restored.enableMcpTool('apply_rules');
    await expect(readFile(settingsPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects unknown and duplicate stored names', async () => {
    const directory = await createTemporaryDirectory(temporaryDirectories);
    const settingsPath = path.join(directory, 'tool-capabilities', 'settings.json');
    await mkdir(path.dirname(settingsPath), { recursive: true });
    await writeFile(settingsPath, JSON.stringify({
      agentDisabledToolNames: ['unknown_tool', 'get_exchange', 'get_exchange'],
      mcpDisabledToolNames: ['query_diagnostics', 'unknown_tool'],
    }), 'utf8');
    const service = new ToolCapabilitySettingsService(settingsPath);

    await expect(service.start()).rejects.toThrow('fields are invalid');
  });

  it('serializes concurrent mutations without losing independent changes', async () => {
    const { service } = await createService(temporaryDirectories);

    await Promise.all([
      service.disableAgentTool('get_proxy_status'),
      service.disableAgentTool('get_exchange'),
      service.disableMcpTool('apply_rules'),
    ]);

    expect(service.snapshot()).toMatchObject({
      agentDisabledToolNames: ['get_proxy_status', 'get_exchange'],
      mcpDisabledToolNames: ['apply_rules'],
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
      agentDisabledToolNames: 'get_exchange',
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