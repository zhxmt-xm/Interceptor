export async function fontsReady(page) {
  await page.evaluate(async () => {
    for (const [family, weights] of Object.entries({
      Inter: [400, 450, 500, 600, 700],
      'JetBrains Mono': [400, 500],
    })) {
      for (const weight of weights) {
        const faces = await document.fonts.load(`${weight} 16px "${family}"`, 'Interceptor');
        if (!faces.length || faces.some((face) => face.status !== 'loaded'))
          throw new Error(`Font did not load: ${family} ${weight}`);
      }
    }
  });
}

const styleKeys = [
  'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'color',
  'backgroundColor', 'borderColor', 'borderRadius', 'paddingTop', 'paddingRight',
  'paddingBottom', 'paddingLeft', 'gap', 'display', 'alignItems', 'overflowY',
  'textDecorationLine', 'textDecorationColor', 'textUnderlineOffset', 'overflowWrap',
];

export async function measure(page, targets) {
  const collect = () => page.evaluate(({ targets, styleKeys }) => Object.fromEntries(targets.map((target) => {
    const elements = [...document.querySelectorAll(target.selector)]
      .filter((element) => !target.visibleOnly || element.checkVisibility());
    if (elements.length !== 1) throw new Error(`${target.id}: expected one node, found ${elements.length}`);
    const element = elements[0];
    const rect = element.getBoundingClientRect();
    const css = getComputedStyle(element);
    return [target.id, {
      geometry: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      styles: Object.fromEntries(styleKeys.map((key) => [key, css[key]])),
      state: {
        visible: element.checkVisibility(),
        focused: document.activeElement === element,
        role: element.getAttribute('role'),
        selected: element.getAttribute('aria-selected'),
        current: element.getAttribute('aria-current'),
        expanded: element.getAttribute('aria-expanded'),
        href: element.getAttribute('href'),
        value: element instanceof HTMLInputElement ? element.value : null,
        text: element.textContent,
        scrollTop: element.scrollTop,
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight,
        documentScrollY: scrollY,
      },
    }];
  })), { targets, styleKeys });
  const end = Date.now() + 2000;
  let previous = await collect();
  do {
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
    const current = await collect();
    if (JSON.stringify(current) === JSON.stringify(previous)) return current;
    previous = current;
  } while (Date.now() < end);
  throw new Error(`Unstable measurements: ${targets.map((target) => target.id).join(', ')}`);
}
