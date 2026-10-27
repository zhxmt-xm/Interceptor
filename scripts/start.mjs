import { spawnSync } from 'node:child_process';
import { glob, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs, styleText } from 'node:util';

import { confirm, input, select } from '@inquirer/prompts';
import stringWidth from 'string-width';
import wrapAnsi from 'wrap-ansi';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const back = Symbol('back');
const all = Symbol('all');
const desktopName = '@interceptor/desktop';
const designName = '@interceptor/design-vite';
const supportedPlatform = ['darwin', 'win32'].includes(process.platform);
const platformRestriction = supportedPlatform ? false : '仅支持 macOS / Windows';
const buildNotices = [
  '自动准备所需构建文件，不需要手动选择构建模式。',
  '请勿与其他构建、开发实例或集成测试并行。',
];
const appNotices = [
  '运行前请关闭其他 Desktop 或 E2E 实例。',
  '应用可能修改系统代理或证书信任，并请求系统授权。',
  '结束时正常关闭应用，等待系统代理恢复。',
];

function choose(message, choices) {
  return select({
    message,
    pageSize: 12,
    choices: [...choices, { name: '返回上一级', value: back }],
  });
}

function npmCommand(script, workspace, args = []) {
  return {
    kind: 'npm',
    args: [
      'run', script,
      ...(workspace ? ['--workspace', workspace.name] : []),
      ...(args.length ? ['--', ...args] : []),
    ],
  };
}

function nodeCommand(file, args = []) {
  return { kind: 'node', args: [file, ...args] };
}

async function readWorkspaces() {
  const metadata = JSON.parse(await readFile(path.join(repositoryRoot, 'package.json'), 'utf8'));
  const workspaces = [];
  for await (const file of glob(metadata.workspaces.map((pattern) => `${pattern}/package.json`), { cwd: repositoryRoot })) {
    const workspace = JSON.parse(await readFile(path.join(repositoryRoot, file), 'utf8'));
    workspaces.push({ name: workspace.name, directory: path.dirname(file), scripts: workspace.scripts });
  }
  return workspaces.sort((left, right) => left.name.localeCompare(right.name));
}

function chooseWorkspace(workspaces, script, includeAll = false) {
  return choose('选择 workspace', [
    ...(includeAll ? [{ name: '全部 workspace', value: all }] : []),
    ...workspaces.filter((workspace) => workspace.scripts?.[script]).map((workspace) => ({
      name: `${workspace.name} (${workspace.directory})`,
      value: workspace,
    })),
  ]);
}

async function chooseDevelopment(workspaces) {
  const design = workspaces.find((workspace) => workspace.name === designName);
  const target = await choose('Development：选择目标', [
    { name: 'Desktop', value: 'desktop', disabled: platformRestriction },
    { name: 'Playground', value: 'playground' },
    { name: 'Design', value: 'design' },
  ]);
  if (target === back) return;
  if (target === 'desktop') {
    return { title: '启动 Desktop', commands: [npmCommand('dev')], notices: appNotices };
  }
  if (target === 'playground') {
    return { title: '启动 Playground', commands: [npmCommand('playground')], notices: ['启动本地 Playground；Ctrl+C 结束服务。'] };
  }
  return {
    title: '启动 Design',
    commands: [npmCommand('dev', design)],
    notices: ['启动设计稿预览，不运行 Desktop。', 'Ctrl+C 结束预览服务。'],
  };
}

async function chooseVitest(workspaces) {
  while (true) {
    const workspace = await chooseWorkspace(workspaces, 'test', true);
    if (workspace === back) return;
    const methods = [{ name: '全部 Unit / Integration，运行一次', value: 'all' }];
    if (workspace !== all) {
      const layers = new Set();
      for await (const file of glob('**/tests/{unit,integration}/**/*.test.{ts,tsx}', {
        cwd: path.join(repositoryRoot, workspace.directory),
        exclude: ['node_modules/**', 'dist/**', 'out/**', '.vite/**'],
      })) {
        layers.add(file.split(path.sep).includes('unit') ? 'unit' : 'integration');
      }
      for (const layer of ['unit', 'integration']) {
        if (layers.has(layer)) methods.push({ name: `只运行 ${layer}`, value: layer });
      }
    }
    const method = methods.length === 1 ? 'all' : await choose('选择测试范围', methods);
    if (method === back) continue;
    const testCommand = workspace === all
      ? { kind: 'npm', args: ['run', 'test', '--workspaces', '--if-present', '--', '--no-file-parallelism'] }
      : npmCommand('test', workspace, [
          ...(method === 'unit' || method === 'integration' ? [`tests/${method}`] : []),
          '--no-file-parallelism',
        ]);
    return {
      title: `Vitest · ${workspace === all ? '全部 workspace' : workspace.name} · ${method}`,
      commands: [npmCommand('build:core'), testCommand],
      notices: [...buildNotices, '先准备测试所需文件，再运行所选测试；失败立即停止。'],
    };
  }
}

async function chooseWorkflow(workspaces) {
  const desktop = workspaces.find((workspace) => workspace.name === desktopName);
  const workflowRoot = path.join(repositoryRoot, desktop.directory, 'tests/e2e-workflow-tests/workflows');
  const features = (await readdir(workflowRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  while (true) {
    const mode = await choose('E2E：选择运行方式', [
      { name: '普通验收（不生成步骤图）', value: 'standard' },
      { name: '逐步截图（同时执行业务断言）', value: 'screenshots' },
      { name: '教程截图更新并发布 Homepage', value: 'guidebook' },
    ]);
    if (mode === back) return;
    if (mode === 'guidebook') {
      const task = await chooseGuidebookPublication();
      if (task) return task;
      continue;
    }
    while (true) {
      const feature = await choose('E2E：选择功能', [
        { name: '全部功能', value: all },
        ...features.map((name) => ({ name, value: name })),
      ]);
      if (feature === back) break;
      const workflows = feature === all ? [] : (await readdir(path.join(workflowRoot, feature)))
        .filter((file) => file.endsWith('.workflow.ts')).sort();
      const workflow = feature === all ? all : await choose(`${feature}：选择 workflow`, [
        { name: '该功能的全部 workflow', value: all },
        ...workflows.map((name) => ({ name, value: name })),
      ]);
      if (workflow === back) continue;
      const filter = feature === all ? [] : [`workflows/${feature}/${workflow === all ? '' : workflow}`];
      return {
        title: `E2E · ${mode === 'screenshots' ? '逐步截图' : '普通验收'} · ${feature === all ? '全部功能' : feature}`,
        commands: [npmCommand('test:e2e:workflow', desktop, [...(mode === 'screenshots' ? ['--screenshots'] : []), ...filter])],
        notices: [
          '默认自动准备测试环境；已指定签名App时沿现有产物入口运行。',
          ...(mode === 'screenshots' ? [
            '自动新建apps/desktop/test-results/workflow-screenshots/下的独立运行目录，开始时显示实际路径。',
            '只生成原workflow的截图证据，不绑定或自动写入官网。',
          ] : ['保留原trace和final.png，不生成步骤截图，不清理独立截图目录。']),
          ...appNotices,
        ],
      };
    }
  }
}

async function chooseGuidebookPublication() {
  console.log('通过当前gh账号读取Homepage的main及截图映射，不需要本地Homepage仓库。');
  const { readRemotePublication } = await import('./guidebook-publish.mjs');
  const { homepageRepository, homepageBranch } = await import('./guidebook-github.mjs');
  const { plan, retainedMedia } = readRemotePublication();
  if (retainedMedia.length > 0) {
    console.log(`清单登记${plan.workflows.length}条自动截图流程；${retainedMedia.length}组独立实录校验后保留。`);
  }
  const source = await choose('教程截图：选择来源', [
    { name: '重拍全部自动来源（独立实录校验后保留）', value: 'capture' },
    { name: '继续截图并发布（复用有效流程，只补缺项）', value: 'resume' },
  ]);
  if (source === back) return;
  const location = source === 'resume' ? await input({
    message: '截图发布目录（含 publication.json，可部分完成）',
    required: true,
  }) : undefined;
  const publish = await confirm({
    message: '全部校验通过后自动 commit 并 push Homepage？',
    default: true,
  });
  return {
    title: `${publish ? '发布' : '只验证'}教程截图更新 · ${plan.workflows.length}条原测试 · ${homepageRepository}/${homepageBranch}`,
    commands: [nodeCommand('scripts/guidebook-publish.mjs', [
      ...(location ? ['--resume', path.resolve(location)] : []),
      ...(!publish ? ['--verify-only'] : []),
    ])],
    notices: [
      `使用English App ${plan.appVersion}，核对清单中的全部原workflow；恢复时只运行缺失或输入失效项。`,
      '默认先打包当前平台App；INTERCEPTOR_E2E_APP_PATH可选择已有Windows exe或macOS .app，来源如实记录。',
      '固定映射逐项核对截图、来源、红框及正文动态示例；缺图、步骤改变、失败或宿主未恢复均停止。',
      ...(retainedMedia.length > 0 ? [
        `${retainedMedia.length}组独立实录核对审核清单、完整PNG与尺寸，不标为本次重拍；任何变化停止发布。`,
      ] : []),
      '拍摄期间自动操作真实窗口和原生文件面板，请保持桌面解锁，不要同时操作其他应用。',
      publish
        ? `全部截图及映射通过后，使用GitHub API提交到 ${homepageRepository}/${homepageBranch}；不提交App代码、不新建分支或强推。`
        : '只生成完整截图集并核对映射，不上传图片、不创建commit、不更新远端。',
      '需要gh已登录且有Homepage写入权限；远端main中途变化立即停止，不clone、不操作本机Git暂存区。',
      'Homepage已有网站CI在更新main后自动运行，本命令不新增或等待另一套Actions流程。',
      ...appNotices,
    ],
  };
}

async function chooseParity() {
  const { views } = await import('../apps/desktop/tests/visual-parity/parity.config.mjs');
  const view = await choose('Parity：选择视图', [
    { name: '全部视图', value: all },
    ...views.map((entry) => ({ name: entry.id, value: entry.id })),
  ]);
  if (view === back) return;
  return {
    title: `Parity · ${view === all ? '全部视图' : view}`,
    commands: [nodeCommand('apps/desktop/tests/visual-parity/parity.mjs', view === all ? [] : [`--view=${view}`])],
    notices: [
      '自动准备设计与Renderer页面并严格比较元素数据，不需要Agent或截图。',
      '使用已有场景、主题和尺寸；差异或执行错误均非零退出，不等同于真实E2E。',
      '结果保存在apps/desktop/test-results/visual-parity/的JSON与Markdown报告。',
    ],
  };
}

async function chooseDemo(workspaces) {
  const desktop = workspaces.find((workspace) => workspace.name === desktopName);
  const workflowRoot = path.join(repositoryRoot, desktop.directory, 'tests/demo-workflow-tests/workflows');
  const features = (await readdir(workflowRoot, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith('.workflow.ts'))
    .map((entry) => entry.name.replace(/\.workflow\.ts$/, ''))
    .sort();
  if (features.length === 0) {
    console.log('没有可用的 demo workflow。');
    return;
  }
  const feature = await choose('Demo：选择 feature', features.map((name) => ({ name, value: name })));
  if (feature === back) return;
  return {
    title: `Demo 视频 · ${feature}`,
    commands: [npmCommand('test:demo:workflow', desktop, ['--feature', feature])],
    notices: [
      '使用packaged App录制单个feature，生成MP4、APNG（README）和中英字幕；不进入E2E全量套件。',
      '默认使用apps/desktop/out/Interceptor-<platform>-<arch>；可用INTERCEPTOR_E2E_APP_PATH或--app指定。',
      '输出到apps/desktop/test-results/demo-videos/<run>/；APNG会覆盖features.json登记的architecture/assets文件。',
      '录制会临时接管系统代理，结束后核对恢复。',
      '首次使用或App产物变化后先执行npm run package。',
      ...appNotices,
    ],
  };
}

async function chooseChecks(workspaces) {
  while (true) {
    const action = await choose('Test：选择项目', [
      { name: 'Typecheck 类型检查', value: 'typecheck' },
      { name: 'Unit / Integration 代码测试', value: 'vitest' },
      { name: 'E2E 用户流程测试', value: 'e2e', disabled: platformRestriction },
      { name: 'Demo 视频（单 feature，中英字幕）', value: 'demo', disabled: platformRestriction },
      { name: 'Parity 设计还原检查', value: 'parity' },
      { name: 'Packaged smoke 打包后验收', value: 'smoke', disabled: platformRestriction },
      { name: 'Artifact audit 打包资源检查', value: 'audit', disabled: platformRestriction },
    ]);
    if (action === back) return;
    if (action === 'typecheck') {
      const workspace = await chooseWorkspace(workspaces, 'typecheck', true);
      if (workspace === back) continue;
      return {
        title: `Typecheck · ${workspace === all ? '全部 workspace' : workspace.name}`,
        commands: [npmCommand('typecheck', workspace === all ? undefined : workspace)],
        notices: ['只检查类型，不启动应用。'],
      };
    }
    if (action === 'smoke') {
      return {
        title: 'Packaged smoke',
        commands: [npmCommand('test:smoke')],
        notices: ['自动打包，再启动应用执行验收。', ...appNotices],
      };
    }
    if (action === 'audit') {
      return {
        title: 'Artifact audit',
        commands: [npmCommand('package'), npmCommand('test:package-audit')],
        notices: [...buildNotices, '打包后检查资源、许可和安全配置，不启动 Desktop。'],
      };
    }
    const task = action === 'vitest' ? await chooseVitest(workspaces)
      : action === 'e2e' ? await chooseWorkflow(workspaces)
      : action === 'demo' ? await chooseDemo(workspaces)
      : await chooseParity();
    if (task) return task;
  }
}

async function chooseBuild() {
  const action = await choose('Build：选择产物', [
    { name: process.platform === 'darwin' ? 'App 应用包 (.app)' : 'App 应用包', value: 'package', disabled: platformRestriction },
    { name: process.platform === 'darwin' ? 'Installer 安装包 (.dmg / .zip)' : 'Installer 安装包 (.msi / .zip)', value: 'make', disabled: platformRestriction },
  ]);
  if (action === back) return;
  return {
    title: action === 'package' ? '构建 App' : '构建 Installer',
    commands: [npmCommand(action)],
    notices: [...buildNotices, `使用当前版本和本机架构 ${process.platform}/${process.arch}，不执行发版。`],
  };
}

function formatCommand(command) {
  return [command.kind === 'npm' ? 'npm' : 'node', ...command.args]
    .map((argument) => /^[\w@./:=,-]+$/.test(argument) ? argument : JSON.stringify(argument)).join(' ');
}

function printColumns(rows) {
  const columns = process.stdout.columns ?? 80;
  const labelWidth = stringWidth('工作目录');
  const prefixWidth = 2 + labelWidth + 3;
  for (const [label, value] of rows) {
    if (columns < prefixWidth + 12) {
      console.log(label);
      for (const line of wrapAnsi(value, Math.max(1, columns - 2), { hard: true, trim: false }).split('\n')) {
        console.log(`  ${line}`);
      }
      continue;
    }
    const lines = wrapAnsi(value, columns - prefixWidth, { hard: true, trim: false }).split('\n');
    for (const [index, line] of lines.entries()) {
      const key = index === 0 ? label : '';
      console.log(`  ${key}${' '.repeat(labelWidth - stringWidth(key))} ${styleText('gray', '│')} ${line}`);
    }
  }
}

function printTask(task) {
  console.log(`\n${styleText('bold', '执行摘要')}`);
  printColumns([['操作', task.title], ['工作目录', repositoryRoot]]);
  console.log(`\n${styleText('bold', '执行步骤')}`);
  printColumns([['步骤', '命令'], ...task.commands.map((command, index) => [String(index + 1), formatCommand(command)])]);
  console.log(`\n${styleText('bold', '注意事项')}`);
  printColumns(task.notices.map((notice) => ['•', notice]));
  console.log();
}

async function runTask(task) {
  printTask(task);
  if (!await confirm({ message: '确认执行以上命令？', default: true })) {
    console.log('未执行任何命令，返回主菜单。\n');
    return true;
  }
  for (const [index, command] of task.commands.entries()) {
    console.log(`\n[${index + 1}/${task.commands.length}] ${formatCommand(command)}`);
    const args = command.kind === 'npm' ? [process.env.npm_execpath, ...command.args] : command.args;
    const result = spawnSync(process.execPath, args, { cwd: repositoryRoot, stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      console.error(`命令未成功结束（${result.signal ?? result.status}），已停止后续步骤。请先检查上述输出，不会自动重试。`);
      process.exitCode = result.status ?? (result.signal === 'SIGINT' ? 130 : 1);
      return false;
    }
  }
  console.log('\n命令执行完成，返回主菜单。\n');
  return true;
}

async function main() {
  const { values } = parseArgs({
    options: { help: { type: 'boolean', short: 'h' } },
    allowPositionals: false,
  });
  if (values.help) {
    console.log('npm start');
    console.log('Development / Test / Build / Release → 目标或必要范围 → 确认执行');
    console.log('Desktop / Design 选择后直接启动；构建准备自动完成，不询问缓存模式。');
    console.log('Test → E2E可选普通验收、逐步截图或教程截图更新并发布Homepage；最后一项按固定清单验收后自动commit/push。');
    console.log('Test → Demo 视频可选单个feature，生成MP4、APNG、中英字幕和SRT；独立目录运行，不并入E2E全量套件。');
    console.log('教程发布重拍全部自动来源；独立真实Host图片按审核摘要校验后保留，不用SDK冒充重拍。');
    console.log('教程发布直接使用gh调用GitHub API；不需要本地Homepage仓库，不clone或推送App分支。');
    console.log('执行摘要分列显示，确认默认 Yes，仍需按 Enter；输入 n 取消。');
    console.log('低频工具保留原命令；Release 启动 npm run release，继续完成发版向导。');
    console.log('↑/↓ 选择，Enter 确认；选择“返回上一级”返回，Ctrl+C 退出。');
    console.log('CI 和非交互环境继续使用原始 npm 命令。说明：architecture/development.md');
    return;
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('npm start 需要交互式终端；请在终端中运行，或使用 npm start -- --help 查看说明。CI 请使用原始命令。');
  }
  if (!process.env.npm_execpath) throw new Error('请通过 npm start 启动，以便使用当前 npm 执行已有命令。');
  const workspaces = await readWorkspaces();
  console.log(`\nInterceptor 开发工具 · ${process.platform}/${process.arch}`);
  console.log('选择目标后自动准备；需要执行时按 Enter，取消时输入 n。\n');
  while (true) {
    const category = await select({
      message: 'Select a category',
      choices: [
        { name: 'Development', value: 'development' },
        { name: 'Test', value: 'test' },
        { name: 'Build', value: 'build' },
        { name: 'Release', value: 'release' },
        { name: 'Exit', value: 'exit' },
      ],
    });
    if (category === 'exit') return;
    const task = category === 'development' ? await chooseDevelopment(workspaces)
      : category === 'test' ? await chooseChecks(workspaces)
      : category === 'build' ? await chooseBuild()
      : {
          title: '启动 Release 发版向导',
          commands: [npmCommand('release')],
          notices: [
            '需要已安装并登录 GitHub CLI（gh），且具备仓库和 Actions 权限。',
            '按指定源码 commit 发版，本地未提交修改不会进入安装包。',
            '发版向导确认启动 CI 后，检查通过即自动 Publish，不再二次询问。',
          ],
        };
    if (task && !await runTask(task)) return;
  }
}

try {
  await main();
} catch (error) {
  if (error instanceof Error && error.name === 'ExitPromptError') {
    console.log('\n已取消；尚未开始的命令不会执行。');
    process.exitCode = 130;
  } else {
    console.error(`[start] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
