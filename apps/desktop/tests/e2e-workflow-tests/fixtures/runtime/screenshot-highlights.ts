import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { Locator, Page } from '@playwright/test';

export interface ScreenshotHighlight {
  readonly target: Locator;
  readonly label?: string;
}

interface Rectangle {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface HighlightGeometry {
  readonly viewport: { readonly width: number; readonly height: number };
  readonly regions: readonly {
    readonly label: string;
    readonly bounds: Rectangle;
    readonly automationId: string | null;
  }[];
}

export interface AnnotatedScreenshot {
  readonly image: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly coordinateSpace: 'image-pixels';
  readonly sourceViewport: { readonly width: number; readonly height: number };
  readonly highlights: readonly {
    readonly label: string;
    readonly bounds: Rectangle;
    readonly automationId: string | null;
  }[];
}

/** Wait for finite UI transitions and exact consecutive frame bounds before capture. */
export async function readStableHighlightGeometry(
  page: Page,
  highlights: readonly ScreenshotHighlight[],
): Promise<HighlightGeometry> {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  for (const { target } of highlights) {
    await target.evaluate((element) => new Promise<void>((resolve) => {
      let previous = '';
      let stableFrames = 0;
      const inspect = () => {
        const rectangle = element.getBoundingClientRect();
        const current = JSON.stringify({
          x: rectangle.x, y: rectangle.y, width: rectangle.width, height: rectangle.height,
        });
        let transitioning = false;
        for (let ancestor: Element | null = element; ancestor; ancestor = ancestor.parentElement) {
          if (ancestor.getAnimations().some((animation) =>
            animation.playState === 'running' && animation.effect?.getTiming().iterations !== Infinity)) {
            transitioning = true;
            break;
          }
        }
        stableFrames = !transitioning && current === previous ? stableFrames + 1 : 0;
        previous = current;
        if (stableFrames >= 3) resolve();
        else requestAnimationFrame(inspect);
      };
      requestAnimationFrame(inspect);
    }));
  }
  return readHighlightGeometry(page, highlights);
}

/** Measure the actual controls without scrolling, styling, or otherwise changing the App. */
export async function readHighlightGeometry(
  page: Page,
  highlights: readonly ScreenshotHighlight[],
): Promise<HighlightGeometry> {
  const viewport = await page.evaluate(() => ({
    width: innerWidth, height: innerHeight, outerWidth, outerHeight,
  }));
  if (process.platform === 'darwin'
    && (viewport.width !== viewport.outerWidth || viewport.height !== viewport.outerHeight)) {
    throw new Error('DOM highlights require the actual frameless App content bounds.');
  }
  const labels = new Set<string>();
  const regions = [];
  for (const [index, highlight] of highlights.entries()) {
    if (highlight.target.page() !== page) throw new Error('A highlight belongs to a different App page.');
    const label = highlight.label ?? String(index + 1);
    if (!/^[1-9]\d*$/.test(label) || labels.has(label)) {
      throw new Error('Screenshot highlight labels must be unique positive integers.');
    }
    labels.add(label);
    const bounds = await highlight.target.boundingBox();
    if (!bounds || bounds.width <= 0 || bounds.height <= 0
      || bounds.x < 0 || bounds.y < 0
      || bounds.x + bounds.width > viewport.width
      || bounds.y + bounds.height > viewport.height) {
      throw new Error(`Highlight ${label} is not fully visible in the captured App window: ${JSON.stringify({ bounds, viewport })}`);
    }
    const intersectionRatio = await highlight.target.evaluate((element) => new Promise<number>((resolve, reject) => {
      const observer = new IntersectionObserver((entries) => {
        observer.disconnect();
        const entry = entries[0];
        if (!entry) {
          reject(new Error('The highlight visibility observer returned no target.'));
          return;
        }
        resolve(entry.intersectionRatio);
      }, { threshold: 1 });
      observer.observe(element);
    }));
    if (intersectionRatio !== 1) {
      throw new Error(`Highlight ${label} is clipped by its visible scroll area: ${JSON.stringify({ bounds, intersectionRatio })}`);
    }
    regions.push({
      label,
      bounds,
      automationId: await highlight.target.getAttribute('data-automation-id'),
    });
  }
  return { viewport: { width: viewport.width, height: viewport.height }, regions };
}

/** Reject a capture if the selected controls moved while the native PNG was being taken. */
export async function verifyHighlightGeometry(
  page: Page,
  highlights: readonly ScreenshotHighlight[],
  before: HighlightGeometry,
): Promise<void> {
  const after = await readHighlightGeometry(page, highlights);
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    throw new Error(`A screenshot highlight moved during capture; the image was not annotated: ${JSON.stringify({ before, after })}`);
  }
}

/** Render numbered red boxes into a separate PNG, retaining the original screenshot bytes. */
export async function annotateScreenshot(
  source: string,
  destination: string,
  image: string,
  geometry: HighlightGeometry,
): Promise<AnnotatedScreenshot> {
  const { default: sharp } = await import('sharp');
  const original = await readFile(source);
  const width = original.readUInt32BE(16);
  const height = original.readUInt32BE(20);
  const scaleX = width / geometry.viewport.width;
  const scaleY = height / geometry.viewport.height;
  const stroke = 3 * Math.min(scaleX, scaleY);
  const labelHeight = 20 * scaleY;
  const highlights = geometry.regions.map((region) => ({
    ...region,
    bounds: {
      x: region.bounds.x * scaleX,
      y: region.bounds.y * scaleY,
      width: region.bounds.width * scaleX,
      height: region.bounds.height * scaleY,
    },
  }));
  const shapes = highlights.map(({ bounds, label }) => {
    const x = Math.max(stroke / 2, bounds.x - 4 * scaleX);
    const y = Math.max(stroke / 2, bounds.y - 4 * scaleY);
    const right = Math.min(width - stroke / 2, bounds.x + bounds.width + 4 * scaleX);
    const bottom = Math.min(height - stroke / 2, bounds.y + bounds.height + 4 * scaleY);
    const labelWidth = Math.max(20, label.length * 11 + 8) * scaleX;
    if (labelWidth > width || labelHeight > height) {
      throw new Error('A screenshot label does not fit the captured image.');
    }
    const labelX = Math.min(x, width - labelWidth);
    const labelY = Math.min(y, height - labelHeight);
    return `<rect x="${x}" y="${y}" width="${right - x}" height="${bottom - y}" fill="none" stroke="#ff2038" stroke-width="${stroke}"/>
<rect x="${labelX}" y="${labelY}" width="${labelWidth}" height="${labelHeight}" fill="#ff2038"/>
<text x="${labelX + labelWidth / 2}" y="${labelY + labelHeight * 0.77}" text-anchor="middle" font-family="Arial,sans-serif" font-size="${16 * scaleY}" font-weight="700" fill="#ffffff">${label}</text>`;
  }).join('\n');
  const overlay = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${shapes}</svg>`,
    'utf8',
  );
  const base = await sharp(original).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const mask = await sharp(overlay).ensureAlpha().raw().toBuffer();
  const raw = { width, height, channels: 4 as const };
  const painted = await sharp(base.data, { raw })
    .composite([{ input: mask, raw }])
    .raw()
    .toBuffer();
  // libvips premultiplication can round translucent window corners; retain untouched pixels exactly.
  for (let offset = 0; offset < painted.length; offset += 4) {
    if (mask[offset + 3] !== 0) painted.copy(base.data, offset, offset, offset + 4);
  }
  await sharp(base.data, { raw }).withIccProfile('srgb').png().toFile(destination);
  const annotated = await readFile(destination);
  if (!(await readFile(source)).equals(original)) {
    throw new Error('The original screenshot changed while its annotation was being generated.');
  }
  return {
    image,
    bytes: annotated.length,
    sha256: createHash('sha256').update(annotated).digest('hex'),
    coordinateSpace: 'image-pixels',
    sourceViewport: geometry.viewport,
    highlights,
  };
}
