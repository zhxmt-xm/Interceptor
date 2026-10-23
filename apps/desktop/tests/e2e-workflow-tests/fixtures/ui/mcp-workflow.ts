import type { Page, TestInfo } from '@playwright/test';

import { AUTOMATION_IDS, AutomationIdFactory } from '../../../../src/shared/automation-ids';
import { expect, type LocalElectronApplicationDriver } from '../runtime/local-electron-driver';
import {
  connectWorkflowMcpClient,
  type WorkflowMcpClient,
} from '../runtime/workflow-mcp-client';
import { getByAutomationId } from './automation';

export interface McpHostConfiguration {
  readonly token: string;
  readonly url: string;
}

export async function openMcpSettings(page: Page): Promise<void> {
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
  await getByAutomationId(page, AUTOMATION_IDS.settings.section.agent).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.mcp.server.root)).toBeVisible();
}

export async function resumeRecording(desktopApp: LocalElectronApplicationDriver): Promise<void> {
  await getByAutomationId(desktopApp.page, AUTOMATION_IDS.shell.workspace.capture).click();
  const recording = getByAutomationId(desktopApp.page, AUTOMATION_IDS.capture.recordingToggle);
  if (await recording.getAttribute('aria-pressed') === 'true') return;
  await recording.click();
  const readinessEnable = getByAutomationId(
    desktopApp.page,
    AUTOMATION_IDS.capture.readiness.enable,
  );
  await expect.poll(async () =>
    await readinessEnable.isVisible() || await recording.getAttribute('aria-pressed') === 'true')
    .toBe(true);
  if (await readinessEnable.isVisible()) await readinessEnable.click();
  await expect(recording).toHaveAttribute('aria-pressed', 'true');
}

export async function copyMcpClientConfiguration(
  desktopApp: LocalElectronApplicationDriver,
  testInfo: TestInfo,
  clientId: string,
): Promise<McpHostConfiguration> {
  await desktopApp.stopTrace(testInfo);
  await getByAutomationId(
    desktopApp.page,
    AutomationIdFactory.mcpClientCopyConfiguration(clientId),
  ).click();
  const text = await desktopApp.page.evaluate(async () => navigator.clipboard.readText());
  const parsed: unknown = JSON.parse(text);
  if (!isRecord(parsed) || !isRecord(parsed.servers) || !isRecord(parsed.servers.interceptor)) {
    throw new Error('Copied MCP configuration omitted the Interceptor server.');
  }
  const server = parsed.servers.interceptor;
  if (typeof server.url !== 'string' || !isRecord(server.headers)
    || typeof server.headers.Authorization !== 'string'
    || !server.headers.Authorization.startsWith('Bearer ')) {
    throw new Error('Copied MCP configuration omitted its endpoint or Bearer credential.');
  }
  const configuration = {
    token: server.headers.Authorization.slice('Bearer '.length),
    url: server.url,
  };
  desktopApp.registerSensitiveTextForEvidenceAudit(configuration.token);
  await desktopApp.startTrace(testInfo);
  return configuration;
}

export async function createWorkflowMcpClient(
  desktopApp: LocalElectronApplicationDriver,
  testInfo: TestInfo,
  label: string,
  clientName: string,
): Promise<{ client: WorkflowMcpClient; clientId: string }> {
  const { page } = desktopApp;
  await openMcpSettings(page);
  const server = getByAutomationId(page, AUTOMATION_IDS.mcp.server.root);
  if (await server.getAttribute('data-server-state') !== 'running') {
    await getByAutomationId(page, AUTOMATION_IDS.mcp.server.enable).click();
    await expect(server).toHaveAttribute('data-server-state', 'running');
  }
  await getByAutomationId(page, AUTOMATION_IDS.mcp.client.add).click();
  await getByAutomationId(page, AUTOMATION_IDS.mcp.client.label).fill(label);
  await getByAutomationId(page, AUTOMATION_IDS.mcp.client.create).click();
  const row = page.locator('[data-automation-id^="mcp.client.row."]');
  await expect(row).toHaveCount(1);
  const clientId = await row.getAttribute('data-client-id');
  if (!clientId) throw new Error('Workflow MCP Client omitted its public identity.');
  const configuration = await copyMcpClientConfiguration(desktopApp, testInfo, clientId);
  return {
    client: await connectWorkflowMcpClient(
      {
        url: configuration.url,
        headers: { Authorization: `Bearer ${configuration.token}` },
      },
      clientName,
      testInfo,
    ),
    clientId,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
