import { execFile } from 'node:child_process';
import { X509Certificate } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import tls from 'node:tls';
import { promisify } from 'node:util';
import type { Page } from '@playwright/test';

import type { CaptureExchangeDetail } from '@interceptor/core-protocol';

import { AUTOMATION_IDS } from '../../../../src/shared/automation-ids';
import { getByAutomationId } from '../../fixtures/ui/automation';
import { startRecording } from '../../fixtures/ui/capture-workflow';
import { sharedCertificateDirectory, waitForCertificateInstallation } from '../../fixtures/ui/https-capture';
import { expect, test } from '../../fixtures/runtime/local-electron-driver';

const execFileAsync = promisify(execFile);

const BILIBILI_EDGE_UIA_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
function Find-BilibiliEdgeRoot {
  $addressCondition = [System.Windows.Automation.PropertyCondition]::new(
    [System.Windows.Automation.AutomationElement]::AutomationIdProperty,
    'view_1021'
  )
  foreach ($edge in @(Get-Process msedge | Where-Object { $_.MainWindowHandle -ne 0 })) {
    $root = [System.Windows.Automation.AutomationElement]::FromHandle($edge.MainWindowHandle)
    $address = $root.FindFirst(
      [System.Windows.Automation.TreeScope]::Descendants,
      $addressCondition
    )
    $valuePattern = $null
    if (
      $address -and
      $address.TryGetCurrentPattern(
        [System.Windows.Automation.ValuePattern]::Pattern,
        [ref]$valuePattern
      ) -and
      ([System.Windows.Automation.ValuePattern]$valuePattern).Current.Value -match '^https://(www\.)?bilibili\.com/'
    ) {
      return $root
    }
  }
  return $null
}`;

interface IdentityEntryEvidence {
  controlType: string;
  descendantControlTypes: string[];
}

interface IdentityEvidence {
  runtimeId: string;
  childCount: number;
  identityEntry: IdentityEntryEvidence;
}

interface ExchangeEvidence {
  host: string | undefined;
  path: string | undefined;
  protocol: string;
  statusCode: number | undefined;
  state: string;
  requestCookieNames: string[];
  responseSetCookieNames: string[];
  ruleEffects: Array<{
    side: 'request' | 'response';
    name: string;
    effect: string;
    ruleId: string | undefined;
  }>;
}

interface RoundCaptureEvidence {
  exchangeCount: number;
  hosts: string[];
  protocols: string[];
  document: ExchangeEvidence;
}

interface RoundEvidence {
  round: number;
  startedAt: number;
  url: string;
  identityBeforeRefresh: IdentityEvidence;
  identityAfterRefresh: IdentityEvidence;
  capture: RoundCaptureEvidence;
}

async function setCurrentEdgeAddress(url: string): Promise<void> {
  await execFileAsync(
    'powershell.exe',
    [
      '-NoProfile',
      '-STA',
      '-Command',
      `${BILIBILI_EDGE_UIA_SCRIPT}
$root = Find-BilibiliEdgeRoot
if (-not $root) { throw 'No visible Bilibili Edge window.' }
$addressCondition = [System.Windows.Automation.PropertyCondition]::new(
  [System.Windows.Automation.AutomationElement]::AutomationIdProperty,
  'view_1021'
)
$address = $root.FindFirst(
  [System.Windows.Automation.TreeScope]::Descendants,
  $addressCondition
)
$valuePattern = $null
if (-not $address.TryGetCurrentPattern(
  [System.Windows.Automation.ValuePattern]::Pattern,
  [ref]$valuePattern
)) { throw 'Edge address bar is not editable.' }
([System.Windows.Automation.ValuePattern]$valuePattern).SetValue('${url.replaceAll("'", "''")}')
$address.SetFocus()
$shell = New-Object -ComObject WScript.Shell
$shell.SendKeys('{ENTER}')`,
    ],
    { windowsHide: true },
  );
}

async function restartEdgeThroughUi(): Promise<void> {
  await setCurrentEdgeAddress('edge://restart');
  await expect.poll(async () => {
    try {
      const { stdout } = await execFileAsync(
        'powershell.exe',
        [
          '-NoProfile',
          '-STA',
          '-Command',
          `${BILIBILI_EDGE_UIA_SCRIPT}
if (Find-BilibiliEdgeRoot) { [Console]::Write('ready') }`,
        ],
        { windowsHide: true, encoding: 'utf8' },
      );
      return stdout.trim().length > 0;
    } catch {
      return false;
    }
  }, {
    message: 'Edge did not restore the Bilibili session after edge://restart',
    timeout: 30_000,
  }).toBe(true);
}

function headerValueNames(
  headers: CaptureExchangeDetail['requestHeaders'],
  headerName: string,
  separator: string,
): string[] {
  return [...new Set(
    headers
      .filter((header) => header.name.toLowerCase() === headerName)
      .flatMap((header) => header.value.split(separator))
      .map((part) => part.trim().split('=', 1)[0] ?? '')
      .filter((name) => name.length > 0),
  )].sort();
}

function cookieNames(headers: CaptureExchangeDetail['requestHeaders']): string[] {
  return headerValueNames(headers, 'cookie', ';');
}

function setCookieNames(headers: CaptureExchangeDetail['responseHeaders']): string[] {
  return [...new Set(
    headers
      .filter((header) => header.name.toLowerCase() === 'set-cookie')
      .flatMap((header) => header.value.split('\n'))
      .map((value) => value.trim().split('=', 1)[0] ?? '')
      .filter((name) => name.length > 0),
  )].sort();
}

async function readBilibiliIdentity(): Promise<IdentityEvidence | null> {
  const { stdout } = await execFileAsync(
    'powershell.exe',
    [
      '-NoProfile',
      '-STA',
      '-Command',
      `${BILIBILI_EDGE_UIA_SCRIPT}
$root = Find-BilibiliEdgeRoot
if (-not $root) { [Console]::Write('null'); exit }
$rootBounds = $root.Current.BoundingRectangle
$listCondition = [System.Windows.Automation.PropertyCondition]::new(
  [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
  [System.Windows.Automation.ControlType]::List
)
$lists = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $listCondition)
$walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
$identity = $null
for ($listIndex = 0; $listIndex -lt $lists.Count; $listIndex++) {
  $list = $lists.Item($listIndex)
  $bounds = $list.Current.BoundingRectangle
  if (
    $list.Current.IsOffscreen -or
    $bounds.Width -lt 400 -or
    $bounds.Height -lt 40 -or
    $bounds.Height -gt 120 -or
    $bounds.X -lt ($rootBounds.X + ($rootBounds.Width * 0.5)) -or
    $bounds.Y -gt ($rootBounds.Y + 300)
  ) { continue }
  $children = @()
  $child = $walker.GetFirstChild($list)
  while ($child) {
    $children += $child
    $child = $walker.GetNextSibling($child)
  }
  if ($children.Count -lt 7) { continue }
  $entry = $children[0]
  $descendants = $entry.FindAll(
    [System.Windows.Automation.TreeScope]::Descendants,
    [System.Windows.Automation.Condition]::TrueCondition
  )
  $types = @()
  for ($descendantIndex = 0; $descendantIndex -lt $descendants.Count; $descendantIndex++) {
    $types += $descendants.Item($descendantIndex).Current.ControlType.ProgrammaticName.Replace(
      'ControlType.',
      ''
    )
  }
  $identity = [ordered]@{
    runtimeId = ($list.GetRuntimeId() -join '.')
    childCount = $children.Count
    identityEntry = [ordered]@{
      controlType = $entry.Current.ControlType.ProgrammaticName.Replace('ControlType.', '')
      descendantControlTypes = @($types)
    }
  }
  break
}
if (-not $identity) { [Console]::Write('null'); exit }
[Console]::Write(($identity | ConvertTo-Json -Compress -Depth 5))`,
    ],
    { windowsHide: true, encoding: 'utf8' },
  );
  return JSON.parse(stdout) as IdentityEvidence;
}

async function waitForBilibiliIdentity(message: string): Promise<IdentityEvidence> {
  let identity: IdentityEvidence | null = null;
  await expect.poll(async () => {
    identity = await readBilibiliIdentity();
    return identity !== null;
  }, { message, timeout: 45_000 }).toBe(true);
  return identity!;
}

function identityShape(identity: IdentityEvidence): IdentityEntryEvidence {
  return identity.identityEntry;
}

function evidencePath(pathValue: string | undefined): string | undefined {
  if (!pathValue) return undefined;
  const pathname = pathValue.split('?', 1)[0] ?? '';
  return pathname.startsWith('/correspond/') ? '/correspond/:challenge' : pathname;
}

async function captureBilibiliHeader(outputPath: string): Promise<void> {
  await execFileAsync(
    'powershell.exe',
    [
      '-NoProfile',
      '-STA',
      '-Command',
      `${BILIBILI_EDGE_UIA_SCRIPT}
Add-Type -AssemblyName System.Drawing
$root = Find-BilibiliEdgeRoot
if (-not $root) { throw 'No visible Bilibili Edge window.' }
$rootBounds = $root.Current.BoundingRectangle
$listCondition = [System.Windows.Automation.PropertyCondition]::new(
  [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
  [System.Windows.Automation.ControlType]::List
)
$lists = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $listCondition)
$bounds = $null
for ($index = 0; $index -lt $lists.Count; $index++) {
  $candidate = $lists.Item($index)
  $candidateBounds = $candidate.Current.BoundingRectangle
  if (
    -not $candidate.Current.IsOffscreen -and
    $candidateBounds.Width -ge 400 -and
    $candidateBounds.Height -ge 40 -and
    $candidateBounds.Height -le 120 -and
    $candidateBounds.X -ge ($rootBounds.X + ($rootBounds.Width * 0.5)) -and
    $candidateBounds.Y -le ($rootBounds.Y + 300)
  ) {
    $bounds = $candidateBounds
    break
  }
}
if (-not $bounds) { throw 'Bilibili header identity list was not found.' }
$padding = 8
$x = [int]$bounds.X - $padding
$y = [int]$bounds.Y - $padding
$width = [int]$bounds.Width + (2 * $padding)
$height = [int]$bounds.Height + (2 * $padding)
$bitmap = [System.Drawing.Bitmap]::new($width, $height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
try {
  $graphics.CopyFromScreen($x, $y, 0, 0, $bitmap.Size)
  $bitmap.Save(
    '${outputPath.replaceAll("'", "''")}',
    [System.Drawing.Imaging.ImageFormat]::Png
  )
} finally {
  $graphics.Dispose()
  $bitmap.Dispose()
}`,
    ],
    { windowsHide: true },
  );
}

async function refreshCurrentBilibiliPage(): Promise<string> {
  const { stdout } = await execFileAsync(
    'powershell.exe',
    [
      '-NoProfile',
      '-STA',
      '-Command',
      `${BILIBILI_EDGE_UIA_SCRIPT}
$root = Find-BilibiliEdgeRoot
if (-not $root) { throw 'No visible Bilibili Edge window.' }
$addressCondition = [System.Windows.Automation.PropertyCondition]::new(
  [System.Windows.Automation.AutomationElement]::AutomationIdProperty,
  'view_1021'
)
$address = $root.FindFirst(
  [System.Windows.Automation.TreeScope]::Descendants,
  $addressCondition
)
$valuePattern = $null
if (-not $address.TryGetCurrentPattern(
  [System.Windows.Automation.ValuePattern]::Pattern,
  [ref]$valuePattern
)) { throw 'Edge address bar value is unavailable.' }
$addressValue = ([System.Windows.Automation.ValuePattern]$valuePattern).Current.Value
$buttonCondition = [System.Windows.Automation.PropertyCondition]::new(
  [System.Windows.Automation.AutomationElement]::AutomationIdProperty,
  'view_1003'
)
$refresh = $root.FindFirst(
  [System.Windows.Automation.TreeScope]::Descendants,
  $buttonCondition
)
if (-not $refresh) { throw 'Edge refresh button was not found.' }
$invokePattern = $null
if (-not $refresh.TryGetCurrentPattern(
  [System.Windows.Automation.InvokePattern]::Pattern,
  [ref]$invokePattern
)) { throw 'Edge refresh button is not invokable.' }
([System.Windows.Automation.InvokePattern]$invokePattern).Invoke()
[Console]::Write($addressValue)`,
    ],
    { windowsHide: true, encoding: 'utf8' },
  );
  return stdout.trim();
}

async function probeMitmCertificate(
  proxyPort: number,
  rootCertificatePath: string,
): Promise<{
  subject: string;
  issuer: string;
  fingerprint256: string;
  rootFingerprint256: string;
  signedByGeneratedRoot: boolean;
}> {
  const root = new X509Certificate(await readFile(rootCertificatePath));
  const socket = net.connect(proxyPort, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('error', reject);
  });
  socket.write(
    'CONNECT www.bilibili.com:443 HTTP/1.1\r\n'
      + 'Host: www.bilibili.com:443\r\n'
      + 'Connection: keep-alive\r\n\r\n',
  );
  let response = '';
  await new Promise<void>((resolve, reject) => {
    const onData = (chunk: Buffer): void => {
      response += chunk.toString('latin1');
      if (!response.includes('\r\n\r\n')) return;
      socket.off('data', onData);
      if (!response.startsWith('HTTP/1.1 200')) {
        reject(new Error(`CONNECT failed: ${response.split('\r\n', 1)[0]}`));
        return;
      }
      resolve();
    };
    socket.on('data', onData);
    socket.once('error', reject);
  });
  const secureSocket = tls.connect({
    socket,
    servername: 'www.bilibili.com',
    rejectUnauthorized: false,
  });
  await new Promise<void>((resolve, reject) => {
    secureSocket.once('secureConnect', resolve);
    secureSocket.once('error', reject);
  });
  const leaf = secureSocket.getPeerX509Certificate();
  secureSocket.destroy();
  if (!leaf) throw new Error('MITM TLS handshake did not expose a leaf certificate.');
  return {
    subject: leaf.subject,
    issuer: leaf.issuer,
    fingerprint256: leaf.fingerprint256,
    rootFingerprint256: root.fingerprint256,
    signedByGeneratedRoot: leaf.verify(root.publicKey),
  };
}

async function readRoundCaptureEvidence(
  page: Page,
  startedAt: number,
): Promise<RoundCaptureEvidence | null> {
  const sessions = await page.evaluate(() => window.interceptor.querySessions({
    limit: 1000,
    sort: 'started_desc',
    filter: {},
  }));
  const summaries = sessions.items
    .filter((item) =>
      item.startedAt >= startedAt
      && (item.host === 'bilibili.com' || item.host?.endsWith('.bilibili.com')),
    )
    .sort((left, right) => right.startedAt - left.startedAt);
  const documentSummary = summaries.find((summary) =>
    summary.host === 'www.bilibili.com'
    && evidencePath(summary.path) === '/'
    && summary.protocol !== 'tls'
    && summary.state === 'completed',
  );
  if (!documentSummary) return null;
  const detail = await page.evaluate(
    (exchangeId) => window.interceptor.getExchangeDetail(exchangeId),
    documentSummary.id,
  );
  if (!detail) return null;
  return {
    exchangeCount: summaries.length,
    hosts: [...new Set(summaries.flatMap((summary) => summary.host ?? []))].sort(),
    protocols: [...new Set(summaries.map((summary) => summary.protocol))].sort(),
    document: {
      host: documentSummary.host,
      path: evidencePath(documentSummary.path),
      protocol: documentSummary.protocol,
      statusCode: documentSummary.statusCode,
      state: documentSummary.state,
      requestCookieNames: cookieNames(detail.requestHeaders),
      responseSetCookieNames: setCookieNames(detail.responseHeaders),
      ruleEffects: [
        ...detail.requestHeaders
          .filter((header) => header.ruleEffect)
          .map((header) => ({
            side: 'request' as const,
            name: header.name,
            effect: header.ruleEffect!,
            ruleId: header.ruleId,
          })),
        ...detail.responseHeaders
          .filter((header) => header.ruleEffect)
          .map((header) => ({
            side: 'response' as const,
            name: header.name,
            effect: header.ruleEffect!,
            ruleId: header.ruleId,
          })),
      ],
    },
  };
}

async function clearDecryptionPreferenceThroughUi(page: Page): Promise<void> {
  const dismissCompatibility = getByAutomationId(
    page,
    AUTOMATION_IDS.settings.tlsCompatibility.dismiss,
  );
  if (await dismissCompatibility.isVisible().catch(() => false)) {
    await dismissCompatibility.click();
  }
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
  await getByAutomationId(page, AUTOMATION_IDS.settings.section.certificates).click();
  const status = await page.evaluate(() => window.interceptor.getCertificateStatus());
  if (status.mitmEnabled) {
    const mitmToggle = getByAutomationId(
      page,
      AUTOMATION_IDS.settings.certificates.mitmToggle,
    );
    await mitmToggle.click();
    await expect.poll(
      () => page.evaluate(() => window.interceptor.getCertificateStatus()),
    ).toMatchObject({ mitmEnabled: false });
  }
  await expect.poll(() => page.evaluate(() => window.interceptor.getCertificateStatus()))
    .toMatchObject({ present: true, trusted: true, mitmEnabled: false });
}

test('Bilibili stays signed in across three MITM page loads', async ({
  desktopApp,
}, testInfo) => {
  test.setTimeout(240_000);
  testInfo.annotations.push({
    type: 'renderer-workflow',
    description: 'capture.bilibili-login-regression',
  });
  const { page } = desktopApp;
  let testError: unknown;

  try {
    // Arrange：在接管代理前，从真实已登录页面采集语言无关的身份入口结构。
    // Arrange: capture the language-neutral identity-entry shape from the real signed-in page before proxy ownership.
    const identityBaseline = await waitForBilibiliIdentity(
      'The signed-in Bilibili identity entry was not available before proxy ownership',
    );
    expect(identityShape(identityBaseline)).toEqual({
      controlType: 'ListItem',
      descendantControlTypes: ['Hyperlink'],
    });

    // 真实UI：复用已初始化的共享CA，仅开启本profile的MITM。
    // Real UI: reuse the initialized shared CA and enable MITM only for this profile.
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
    await getByAutomationId(page, AUTOMATION_IDS.settings.section.certificates).click();
    await waitForCertificateInstallation(page);
    const uninstall = getByAutomationId(
      page,
      AUTOMATION_IDS.settings.certificates.uninstall,
    );
    await expect(uninstall).toBeVisible();
    await expect(uninstall).toBeEnabled();
    const mitmToggle = getByAutomationId(
      page,
      AUTOMATION_IDS.settings.certificates.mitmToggle,
    );
    await expect(mitmToggle).toHaveAttribute('aria-checked', 'false');
    await mitmToggle.click();
    await expect(mitmToggle).toHaveAttribute('aria-checked', 'true');

    // MITM已开启后，通过真实UI开始Recording并接管系统代理。
    // Only after MITM is enabled, start Recording and own the system proxy through UI.
    await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.capture).click();
    await startRecording(desktopApp);
    const runtime = await page.evaluate(async () => ({
      certificate: await window.interceptor.getCertificateStatus(),
      proxy: await window.interceptor.getSystemProxyStatus(),
      capture: await window.interceptor.getCaptureStatus(),
    }));
    expect(runtime).toMatchObject({
      certificate: { trusted: true, mitmEnabled: true },
      proxy: { owned: true, ownershipLost: false },
      capture: { recording: true },
    });

    // 数据面：leaf必须由产品启动时检查的共享CA签发。
    // Data plane: the leaf must be signed by the shared CA verified during product startup.
    const certificateProbe = await probeMitmCertificate(
      desktopApp.capturePort(),
      path.join(sharedCertificateDirectory(), 'root-cert.pem'),
    );
    const certificatePath = testInfo.outputPath('bilibili-mitm-certificate.json');
    await writeFile(certificatePath, JSON.stringify(certificateProbe, null, 2), 'utf8');
    await testInfo.attach('bilibili-mitm-certificate.json', {
      path: certificatePath,
      contentType: 'application/json',
    });
    expect(certificateProbe.signedByGeneratedRoot).toBe(true);
    await restartEdgeThroughUi();

    // 对当前真实bilibili.com标签页执行三轮原生刷新，每轮身份入口结构都必须保持不变。
    // Refresh the current real bilibili.com tab three times; every round must retain the identity-entry shape.
    const rounds: RoundEvidence[] = [];
    for (let round = 1; round <= 3; round += 1) {
      const identityBeforeRefresh = await waitForBilibiliIdentity(
        `Bilibili header did not settle before round ${round}`,
      );
      expect(identityShape(identityBeforeRefresh)).toEqual(identityShape(identityBaseline));
      const startedAt = Date.now();
      const url = await refreshCurrentBilibiliPage();
      let capture: RoundCaptureEvidence | null = null;
      await expect.poll(async () => {
        capture = await readRoundCaptureEvidence(page, startedAt);
        return capture !== null;
      }, {
        message: `Bilibili document was not captured in round ${round}`,
        timeout: 45_000,
      }).toBe(true);
      let identityAfterRefresh = identityBeforeRefresh;
      await expect.poll(async () => {
        const currentIdentity = await readBilibiliIdentity();
        if (!currentIdentity) return false;
        identityAfterRefresh = currentIdentity;
        return currentIdentity.runtimeId !== identityBeforeRefresh.runtimeId;
      }, {
        message: `Bilibili header did not reload in round ${round}`,
        timeout: 45_000,
      }).toBe(true);
      const roundEvidence: RoundEvidence = {
        round,
        startedAt,
        url,
        identityBeforeRefresh,
        identityAfterRefresh,
        capture: capture!,
      };
      rounds.push(roundEvidence);
      const evidencePath = testInfo.outputPath(`bilibili-login-round-${round}.json`);
      await writeFile(evidencePath, JSON.stringify(roundEvidence, null, 2), 'utf8');
      await testInfo.attach(`bilibili-login-round-${round}.json`, {
        path: evidencePath,
        contentType: 'application/json',
      });
      const headerScreenshotPath = testInfo.outputPath(`bilibili-header-round-${round}.png`);
      await captureBilibiliHeader(headerScreenshotPath);
      await testInfo.attach(`bilibili-header-round-${round}.png`, {
        path: headerScreenshotPath,
        contentType: 'image/png',
      });
      expect(capture!.document).toMatchObject({
        host: 'www.bilibili.com',
        path: '/',
        statusCode: 200,
        state: 'completed',
      });
      expect(capture!.document.requestCookieNames).toEqual(expect.arrayContaining([
        'DedeUserID',
        'SESSDATA',
        'bili_jct',
      ]));
      expect(capture!.document.ruleEffects).toEqual([]);
      expect(identityShape(identityAfterRefresh)).toEqual(identityShape(identityBaseline));
    }
    const evidencePath = testInfo.outputPath('bilibili-login-rounds.json');
    await writeFile(evidencePath, JSON.stringify({ runtime, rounds }, null, 2), 'utf8');
    await testInfo.attach('bilibili-login-rounds.json', {
      path: evidencePath,
      contentType: 'application/json',
    });
  } catch (error) {
    testError = error;
  } finally {
    await clearDecryptionPreferenceThroughUi(page);
  }
  if (testError) throw testError;
});
