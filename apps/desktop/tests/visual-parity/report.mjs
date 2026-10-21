import { access } from 'node:fs/promises';
import path from 'node:path';

const pages = {
  capture: '抓包',
  rules: '规则与映射',
  composer: '请求构造器',
  diagnostics: '诊断',
  settings: '设置',
};
const themes = { light: '浅色', dark: '深色', warm: '暖色', ember: '余烬' };
const conclusions = {
  passed: '未发现问题',
  differences: '发现差异',
  error: '检查未完成',
};
const stages = {
  'configuration/execution': '启动或配置',
  setup: '页面准备',
  scene: '场景操作',
  'design-scene': '设计稿场景准备',
  'renderer-scene': 'Renderer 场景准备',
  comparison: '数据比较',
  'design-page': '设计页面',
  'renderer-page': 'Renderer 页面',
  'renderer-build': 'Renderer 构建',
  cleanup: '资源关闭',
  batch: '批次执行',
  report: '报告保存',
};
const properties = {
  x: '水平位置', y: '垂直位置', width: '宽度', height: '高度',
  fontFamily: '字体声明', fontSize: '字号', fontWeight: '字重',
  letterSpacing: '字间距', lineHeight: '行高', textTransform: '文字大小写',
  color: '文字颜色', backgroundColor: '背景颜色', opacity: '不透明度',
  borderWidth: '边框宽度', borderTopWidth: '上边框宽度', borderBottomWidth: '下边框宽度',
  borderColor: '边框颜色', borderRadius: '圆角', boxShadow: '阴影', strokeWidth: '描边宽度',
  padding: '内边距', gap: '控件间距', alignItems: '交叉轴对齐', justifyContent: '主轴对齐',
  display: '布局方式', minHeight: '最小高度', resize: '拖拽缩放方式',
  present: '存在状态', visible: '可见状态', disabled: '禁用状态',
  checked: '勾选状态', selected: '选中状态', expanded: '展开状态',
  pressed: '按下状态', focused: '焦点状态', content: '文字内容',
  clientWidth: '可视宽度', clientHeight: '可视高度',
  scrollWidth: '内容宽度', scrollHeight: '内容高度',
  scrollLeft: '水平滚动位置', scrollTop: '垂直滚动位置',
};
const booleanValues = {
  present: ['不存在', '存在'], visible: ['不可见', '可见'], disabled: ['启用', '禁用'],
  checked: ['未勾选', '已勾选'], selected: ['未选中', '已选中'], expanded: ['折叠', '展开'],
  pressed: ['未按下', '已按下'], focused: ['无焦点', '有焦点'],
};

function displayValue(value, issue) {
  if (value === null || value === undefined) return '未取得';
  if (typeof value === 'boolean') return booleanValues[issue.property]?.[Number(value)] ?? (value ? '是' : '否');
  if (issue.kind === 'text') return JSON.stringify(value);
  if (typeof value === 'number') return `${value}${['geometry', 'scroll'].includes(issue.kind) ? ' px' : ''}`;
  return typeof value === 'string' ? value || '""' : JSON.stringify(value);
}

function describeIssue(issue) {
  const side = issue.side === 'design' ? '设计稿' : 'Renderer';
  if (issue.kind === 'missing') return `${side}未找到该控件，预期应有1个。`;
  if (issue.kind === 'ambiguous') return `${side}匹配到${issue.actual.matches}个控件，预期应只有1个。`;
  if (issue.kind === 'unstable') return `${side}在稳定窗口内的测量值持续变化，无法确认稳定结果；前后读数见JSON。`;
  if (issue.kind === 'error') return `${side}读取失败：${String(issue.actual.message).split('\n')[0]}`;

  if (issue.property === 'fontFamily' && typeof issue.expected === 'string' && typeof issue.actual === 'string') {
    for (const [longer, shorter, owner, other] of [
      [issue.expected, issue.actual, '设计', 'Renderer'],
      [issue.actual, issue.expected, 'Renderer', '设计'],
    ]) {
      if (shorter && longer.endsWith(shorter)) {
        const prefix = longer.slice(0, longer.length - shorter.length);
        if (/,\s*$/.test(prefix)) {
          return `字体声明：${owner}额外优先声明了 ${prefix.replace(/,\s*$/, '')}，${other}未声明该前缀。`;
        }
      }
    }
  }
  const label = properties[issue.property] ?? issue.property;
  const expected = displayValue(issue.expected, issue);
  const actual = displayValue(issue.actual, issue);
  let change = '';
  if (typeof issue.delta === 'number') {
    const direction = {
      x: issue.delta > 0 ? '向右偏移' : '向左偏移',
      y: issue.delta > 0 ? '向下偏移' : '向上偏移',
      width: issue.delta > 0 ? '宽了' : '窄了',
      height: issue.delta > 0 ? '高了' : '矮了',
    }[issue.property] ?? (issue.delta > 0 ? '增加' : '减少');
    change = `（${direction} ${Math.abs(issue.delta)}${['geometry', 'scroll'].includes(issue.kind) ? ' px' : ''}）`;
  }
  return issue.side
    ? `${label}：预期 ${expected}，${side}实际 ${actual}${change}。`
    : `${label}：设计 ${expected}，Renderer ${actual}${change}。`;
}

function escapeText(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function fileLink(file, options) {
  const relative = path.relative(path.dirname(options.reportPath), path.join(options.repoRoot, file))
    .split(path.sep).join('/');
  const label = file === 'apps/desktop/tests/visual-parity/parity.config.mjs'
    ? '未定位源码，查看场景配置'
    : file.replace('apps/desktop/src/renderer/', 'Renderer/');
  return `[${escapeText(label)}](<${relative}>)`;
}

function locationText(location) {
  const theme = location.themes.length ? `（${location.themes.join('、')}）` : '';
  return `${location.page}${theme} / \`${escapeText(location.target)}\``;
}

export async function createReadableReport(report, options) {
  const configFile = 'apps/desktop/tests/visual-parity/parity.config.mjs';
  const runnerFile = 'apps/desktop/tests/visual-parity/parity.mjs';
  const filesByStylesheet = new Map();

  async function filesFor(issue) {
    if (!['geometry', 'style', 'state', 'text', 'scroll'].includes(issue.kind)) return [];
    const files = new Set();
    for (const file of issue.styleFiles ?? []) {
      const normalized = path.normalize(file);
      if (!file.startsWith('apps/desktop/src/renderer/') || !file.endsWith('.module.css')
        || normalized.split(path.sep).join('/') !== file) continue;
      if (!filesByStylesheet.has(file)) {
        const component = file.replace(/\.module\.css$/, '.tsx');
        const entry = { style: file };
        try {
          await access(path.join(options.repoRoot, file));
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
          filesByStylesheet.set(file, null);
          continue;
        }
        try {
          await access(path.join(options.repoRoot, component));
          entry.component = component;
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
        filesByStylesheet.set(file, entry);
      }
      const entry = filesByStylesheet.get(file);
      if (!entry) continue;
      files.add(['state', 'text'].includes(issue.kind) && entry.component ? entry.component : entry.style);
    }
    return [...files].sort();
  }

  const rows = new Map();
  const errorFiles = new Set();
  const affectedLocations = new Set();
  const unlocatedLocations = new Set();
  function addRow(file, location, problem) {
    if (!rows.has(file)) rows.set(file, { file, problems: new Map() });
    const row = rows.get(file);
    if (!row.problems.has(problem.key)) row.problems.set(problem.key, { description: problem.description, locations: new Map() });
    const group = row.problems.get(problem.key);
    const key = `${location.page}\0${location.target}`;
    if (!group.locations.has(key)) group.locations.set(key, { ...location, themes: new Set(), views: new Set() });
    const entry = group.locations.get(key);
    if (location.theme) entry.themes.add(location.theme);
    if (location.view) entry.views.add(location.view);
  }

  for (const view of report.views) {
    const page = pages[view.feature] ?? '页面';
    const theme = themes[view.theme] ?? view.theme;
    for (const issue of view.issues) {
      const location = { page, theme, view: view.id, target: issue.target };
      const key = `${view.id}\0${issue.target}`;
      affectedLocations.add(key);
      issue.files = await filesFor(issue);
      const problem = {
        key: JSON.stringify([issue.kind, issue.property, issue.expected, issue.actual, issue.delta ?? null, issue.side ?? null]),
        description: describeIssue(issue),
      };
      if (issue.files.length) {
        for (const file of issue.files) addRow(file, location, problem);
      } else {
        unlocatedLocations.add(key);
        addRow(configFile, location, problem);
      }
    }
    for (const error of view.errors) {
      const sceneError = error.stage === 'design-scene' || error.stage === 'renderer-scene';
      const pageError = error.stage === 'design-page' || error.stage === 'renderer-page';
      const stage = stages[error.stage] ?? '场景执行';
      const location = { page, theme, view: view.id, target: `${stage} / ${view.id}` };
      const file = sceneError || pageError ? configFile : runnerFile;
      if (pageError) unlocatedLocations.add(`${view.id}\0${stage}`);
      const description = sceneError ? '场景未就绪，未进行元素比较'
        : pageError ? '页面运行错误，源码尚未定位' : '场景执行失败';
      errorFiles.add(file);
      addRow(file, location, {
        key: JSON.stringify([error.stage, error.message]),
        description: `${description}：${error.message.split('\n')[0]}；完整日志见JSON。`,
      });
    }
  }
  for (const error of report.errors) {
    errorFiles.add(runnerFile);
    addRow(runnerFile, { page: '执行过程', target: stages[error.stage] ?? '执行过程' }, {
      key: JSON.stringify([error.stage, error.message]),
      description: `检查或收尾失败：${error.message.split('\n')[0]}；完整日志见JSON。`,
    });
  }

  const locations = [...rows.values()].sort((left, right) =>
    Number(errorFiles.has(right.file)) - Number(errorFiles.has(left.file)) || left.file.localeCompare(right.file))
    .map(row => ({
      file: row.file,
      problems: [...row.problems.values()].map(problem => ({
        description: problem.description,
        locations: [...problem.locations.values()].map(location => ({
          ...location, themes: [...location.themes], views: [...location.views],
        })),
      })),
    }));
  report.locations = locations;
  report.overview = {
    conclusion: conclusions[report.summary.status],
    affectedLocations: affectedLocations.size,
    relatedFiles: locations.filter(row => row.file !== configFile && row.file !== runnerFile).length,
    unlocatedLocations: unlocatedLocations.size,
  };
  const overview = report.overview;
  const range = `检查范围：${report.summary.executed}/${report.summary.selected} 个场景，${report.summary.checked}/${report.summary.targets} 个控件。`;
  const result = `检查结果：${overview.conclusion}${overview.relatedFiles ? `，涉及 ${overview.relatedFiles} 个相关文件` : ''}。`;
  const lines = [
    '# UI 检查报告', '', `**${result}**`, '', range,
    '检查内容：位置、尺寸、字体、样式、状态和滚动，以各场景声明的字段为准。',
  ];
  if (overview.unlocatedLocations) lines.push(`源码位置尚未确定：${overview.unlocatedLocations} 处，先检查对应场景配置。`);
  if (report.summary.errors) lines.push(`执行问题：${report.summary.errors} 项，不能视为检查通过。`);
  if (report.summary.unrun.length) lines.push(`尚未执行：${report.summary.unrun.length} 个场景，具体名单见JSON。`);

  if (locations.length) {
    lines.push('', '## 问题在哪');
    for (const row of locations) {
      lines.push('', `### ${fileLink(row.file, options)}`, '', '| 页面 / 控件 | 具体差异 |', '| --- | --- |');
      for (const problem of row.problems) {
        const description = escapeText(problem.description.replace(/([\\`*_[\]])/g, '\\$1'));
        lines.push(`| ${problem.locations.map(locationText).join('；')} | ${description} |`);
      }
    }
    lines.push('', '> 文件对应控件、最近容器或弹窗内容组件，不等于已经确认的根因。控件标识保留原名，方便搜索配置。');
  }
  const jsonRelative = path.relative(path.dirname(options.reportPath), options.resultJsonPath).split(path.sep).join('/');
  lines.push('', `完整场景、主题、原始数值和日志见[JSON明细](<${jsonRelative}>)。`, '');
  if (report.warnings?.length) lines.push(`另有 ${report.warnings.length} 条构建提示，原文保留在JSON中。`, '');
  const logCount = (report.logs?.length ?? 0) + report.views.reduce((sum, view) => sum + (view.logs?.length ?? 0), 0);
  if (logCount) lines.push(`浏览器控制台记录：${logCount} 条，按场景保留在JSON的logs中；业务失败日志不等同于构建失败，未处理的页面错误另计。`, '');

  const consoleLines = [range, result];
  const problems = locations.flatMap(row => row.problems.map(problem => ({ file: row.file, ...problem })));
  for (const problem of problems.slice(0, 10)) {
    const first = problem.locations[0];
    consoleLines.push(`- ${problem.file}：${first.page} / ${first.target}；${problem.description}${problem.locations.length > 1 ? `（共${problem.locations.length}处）` : ''}`);
  }
  if (problems.length > 10) consoleLines.push(`另有 ${problems.length - 10} 条具体差异，见可读报告。`);
  if (report.summary.errors) consoleLines.push(`执行问题：${report.summary.errors} 项。`);
  if (overview.unlocatedLocations) consoleLines.push(`仍有 ${overview.unlocatedLocations} 处源码位置未确定，见场景配置。`);
  consoleLines.push(`可读报告：${options.reportPath}`, `原始数据：${options.resultJsonPath}`);
  return { markdown: lines.join('\n'), consoleLines };
}
