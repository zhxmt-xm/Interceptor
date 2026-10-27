import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import ffmpeg from '@ffmpeg-installer/ffmpeg';

const args = process.argv.slice(2);
const runIndex = args.indexOf('--run');
if (runIndex < 0) throw new Error('Missing --run <output directory>.');
const run = path.resolve(args[runIndex + 1]);
const capture = path.join(run, 'capture');
const framesFile = path.join(capture, 'frames.json');
const captionsFile = path.join(capture, 'captions.json');
if (!existsSync(framesFile) || !existsSync(captionsFile)) {
  throw new Error(`Missing demo capture in ${capture}`);
}

const frames = JSON.parse(readFileSync(framesFile, 'utf8'));
const captions = JSON.parse(readFileSync(captionsFile, 'utf8'));
if (frames.length === 0) throw new Error('The demo capture contains no frames.');
if (captions.length === 0) throw new Error('The demo capture contains no captions.');

const fps = 12;
const end = captions.at(-1).end;
const count = Math.max(1, Math.ceil((end / 1000) * fps));
const sequence = path.join(run, 'sequence');
rmSync(sequence, { recursive: true, force: true });
mkdirSync(sequence, { recursive: true });
for (let index = 0; index < count; index += 1) {
  const time = (index * 1000) / fps;
  let frame = frames[0];
  for (const candidate of frames) {
    if (candidate.at <= time) frame = candidate;
    else break;
  }
  copyFileSync(frame.file, path.join(sequence, `frame-${String(index).padStart(5, '0')}.jpg`));
}

function assTime(milliseconds) {
  const total = Math.max(0, milliseconds) / 1000;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return `${hours}:${String(minutes).padStart(2, '0')}:${seconds.toFixed(2).padStart(5, '0')}`;
}

function assText(text) {
  return text.replace(/\\/g, '\\\\').replace(/[{}]/g, '').replace(/\r?\n/g, '\\N');
}

const englishFont = process.platform === 'win32'
  ? 'Segoe UI Semibold'
  : process.platform === 'darwin' ? 'Helvetica Neue' : 'DejaVu Sans';
const chineseFont = process.platform === 'win32'
  ? 'Microsoft YaHei'
  : process.platform === 'darwin' ? 'PingFang SC' : 'Noto Sans CJK SC';

const ass = [
  '[Script Info]',
  'ScriptType: v4.00+',
  'PlayResX: 1200',
  'PlayResY: 676',
  'WrapStyle: 0',
  'ScaledBorderAndShadow: yes',
  '',
  '[V4+ Styles]',
  'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
  `Style: EN,${englishFont},30,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,1,0,2,60,60,58,1`,
  `Style: ZH,${chineseFont},24,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,1,0,2,60,60,26,1`,
  '',
  '[Events]',
  'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ...captions.flatMap((caption) => [
    `Dialogue: 0,${assTime(caption.start)},${assTime(caption.end)},EN,,0,0,0,,${assText(caption.en)}`,
    `Dialogue: 0,${assTime(caption.start)},${assTime(caption.end)},ZH,,0,0,0,,${assText(caption.zh)}`,
  ]),
  '',
].join('\n');
writeFileSync(path.join(run, 'captions.ass'), ass, 'utf8');

const ffmpegExecutable = process.env.FFMPEG_PATH || ffmpeg.path;
const captioned = path.join(run, 'captioned');
rmSync(captioned, { recursive: true, force: true });
mkdirSync(captioned, { recursive: true });
const encoded = spawnSync(ffmpegExecutable, [
  '-y',
  '-framerate', String(fps),
  '-i', path.join('sequence', 'frame-%05d.jpg'),
  '-vf', 'fps=10,scale=1200:-2:flags=lanczos,ass=captions.ass',
  '-c:v', 'png',
  path.join('captioned', 'frame-%05d.png'),
], { cwd: run, stdio: 'inherit' });
if (encoded.error) throw encoded.error;
if (encoded.status !== 0) throw new Error(`caption rendering failed with status ${encoded.status}`);

const readme = path.join(run, 'readme.png');
const apng = spawnSync(ffmpegExecutable, [
  '-y',
  '-framerate', '10',
  '-i', path.join('captioned', 'frame-%05d.png'),
  '-c:v', 'apng',
  '-plays', '0',
  '-f', 'apng',
  'readme.png',
], { cwd: run, stdio: 'inherit' });
if (apng.error) throw apng.error;
if (apng.status !== 0) throw new Error(`APNG encoding failed with status ${apng.status}`);
if (!existsSync(readme) || statSync(readme).size === 0) throw new Error('ffmpeg did not produce readme.png');
rmSync(captioned, { recursive: true, force: true });

const repositoryRoot = path.resolve(import.meta.dirname, '../../../..');
const assetIndex = args.indexOf('--asset');
const asset = assetIndex >= 0 ? args[assetIndex + 1] : undefined;
let readmeAsset;
if (asset) {
  const target = path.resolve(repositoryRoot, asset);
  mkdirSync(path.dirname(target), { recursive: true });
  copyFileSync(readme, target);
  readmeAsset = path.relative(repositoryRoot, target).split(path.sep).join('/');
  console.log(`[demo] README asset ${target}`);
}

writeFileSync(path.join(run, 'manifest.json'), `${JSON.stringify({
  feature: process.env.INTERCEPTOR_DEMO_FEATURE ?? path.basename(run),
  locale: process.env.INTERCEPTOR_E2E_LOCALE ?? null,
  app: process.env.INTERCEPTOR_E2E_APP_PATH ?? null,
  durationMs: end,
  fps: 10,
  sequenceFrames: count,
  readme: 'readme.png',
  readmeAsset: readmeAsset ?? null,
  captions: 'captions.ass',
  captionsText: captions,
}, null, 2)}\n`, 'utf8');

console.log(`[demo] README APNG ${readme} (${statSync(readme).size} bytes)`);
