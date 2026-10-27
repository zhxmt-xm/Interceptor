import { AUTOMATION_IDS } from '../../../src/shared/automation-ids';
import { getByAutomationId } from '../../e2e-workflow-tests/fixtures/ui/automation';
import { expect, test } from '../fixtures/demo-recorder';

const CHINESE = (process.env.INTERCEPTOR_E2E_LOCALE ?? '').toLowerCase().startsWith('zh');
const PROFILE_NAME = CHINESE ? 'README 演示模型' : 'README demo model';
const PROMPT = CHINESE ? 'Interceptor 正在捕获什么？' : 'What is Interceptor capturing?';
const ANSWER = CHINESE
  ? 'Interceptor 可以解释捕获的流量以及命中的 Rules。'
  : 'Interceptor can explain the captured traffic and the Rules that matched it.';

test('demo.agent configures a local model and asks about traffic', async ({
  desktopApp,
  openAiCompatibleLab,
  demo,
}) => {
  test.setTimeout(240_000);
  const { page } = desktopApp;

  await demo.start();
  demo.caption({
    en: 'Connect a model in Settings.',
    zh: '在 Settings 中连接模型。',
  });
  await page.waitForTimeout(1000);
  await getByAutomationId(page, AUTOMATION_IDS.shell.workspace.settings).click();
  await getByAutomationId(page, AUTOMATION_IDS.settings.section.agent).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.models.add).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.models.addCustom).click();

  demo.caption({
    en: 'Point it at an OpenAI-compatible endpoint.',
    zh: '填入 OpenAI 兼容接口地址。',
  });
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.profileName).fill(PROFILE_NAME);
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.baseUrl)
    .fill(openAiCompatibleLab.baseUrl('demo-agent'));
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.modelId).fill('demo-model');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.contextWindow).fill('131072');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.maximumOutput).fill('8192');
  await page.waitForTimeout(900);
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.testConnection).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.agent.provider.connectionStatus))
    .toHaveAttribute('data-status', 'verified');
  await getByAutomationId(page, AUTOMATION_IDS.agent.provider.save).click();
  await expect(getByAutomationId(page, AUTOMATION_IDS.agent.provider.dialog)).toHaveCount(0);
  await page.waitForTimeout(700);

  demo.caption({
    en: 'Ask the Agent about the traffic.',
    zh: '向 Agent 询问流量。',
  });
  await getByAutomationId(page, AUTOMATION_IDS.agent.panel.toggle).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.chat.new).click();
  await getByAutomationId(page, AUTOMATION_IDS.agent.message.input)
    .fill(PROMPT);
  openAiCompatibleLab.enqueueTurn({ textChunks: [ANSWER] });
  await getByAutomationId(page, AUTOMATION_IDS.agent.message.send).click();

  demo.caption({
    en: 'Read the answer; Tools stay scoped to the session.',
    zh: '查看回答；Tools 受当前会话范围限制。',
  });
  await expect(getByAutomationId(page, AUTOMATION_IDS.agent.session.transcript))
    .toContainText(ANSWER, { timeout: 15_000 });
  await page.waitForTimeout(2000);
  await demo.stop();
});
