interface TreeAdapterOptions {
  readonly tree: HTMLElement | null;
  readonly rowSelector: string;
  readonly folderRowClass: string;
  readonly groupClass: string;
  readonly groupBodyClass: string;
}

function elementChildren(element: Element): HTMLElement[] {
  return Array.from(element.children).filter((child): child is HTMLElement => child instanceof HTMLElement);
}

export function installTreeDrag(options: TreeAdapterOptions): () => void {
  const { tree, rowSelector, folderRowClass, groupClass, groupBodyClass } = options;
  if (!tree) return () => undefined;
  const dropLine = document.createElement('div');
  dropLine.className = 'rdrop';
  let dragNode: HTMLElement | null = null;
  let drop: { parent?: Element; before?: Element | null; folder?: HTMLElement } | null = null;
  let autoExpandTimer = 0;

  const nodeOf = (row: HTMLElement): HTMLElement => row.classList.contains(folderRowClass)
    ? row.closest<HTMLElement>(`.${groupClass}`) ?? row
    : row;
  const folderDepth = (element: Element): number => {
    let depth = 0;
    for (let node: Element | null = element; node && node !== tree; node = node.parentElement) {
      if (node.classList.contains(groupClass)) depth += 1;
    }
    return depth;
  };
  const subtreeHeight = (node: HTMLElement | null): number => {
    if (!node?.classList.contains(groupClass)) return 0;
    const body = node.querySelector<HTMLElement>(`.${groupBodyClass}`);
    if (!body) return 1;
    return 1 + elementChildren(body)
      .filter((child) => child.classList.contains(groupClass))
      .reduce((height, child) => Math.max(height, subtreeHeight(child)), 0);
  };
  const fitsDepth = (parentDepth: number): boolean => parentDepth + subtreeHeight(dragNode) <= 3;
  const clearFeedback = (): void => {
    drop = null;
    dropLine.remove();
    tree.querySelectorAll('.droptarget').forEach((row) => row.classList.remove('droptarget'));
  };
  const finish = (): void => {
    window.clearTimeout(autoExpandTimer);
    if (dragNode) {
      dragNode.classList.remove('dragsource');
      if (dragNode.dataset.reopen) dragNode.classList.add('on');
      delete dragNode.dataset.reopen;
    }
    dragNode = null;
    clearFeedback();
  };
  const showLine = (node: HTMLElement, after: boolean, indent: number): void => {
    const treeRect = tree.getBoundingClientRect();
    const rect = node.getBoundingClientRect();
    dropLine.style.top = `${(after ? rect.bottom : rect.top) - treeRect.top + tree.scrollTop - 1}px`;
    dropLine.style.left = `${rect.left - treeRect.left + indent}px`;
    dropLine.style.width = `${rect.width - indent}px`;
    tree.appendChild(dropLine);
  };
  const rowAt = (clientY: number): { row: HTMLElement; rect: DOMRect } | null => {
    for (const row of tree.querySelectorAll<HTMLElement>(rowSelector)) {
      if (!row.offsetParent) continue;
      const rect = row.getBoundingClientRect();
      if (clientY < rect.bottom) return { row, rect };
    }
    return null;
  };
  const onDragStart = (event: DragEvent): void => {
    const row = (event.target as Element).closest<HTMLElement>(rowSelector);
    if (!row || !event.dataTransfer) return;
    dragNode = nodeOf(row);
    dragNode.classList.add('dragsource');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', '');
    if (dragNode.classList.contains(groupClass)) {
      dragNode.dataset.reopen = dragNode.classList.contains('on') ? '1' : '';
      dragNode.classList.remove('on');
    }
  };
  const onDragOver = (event: DragEvent): void => {
    if (!dragNode || !event.dataTransfer) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    clearFeedback();
    const hit = rowAt(event.clientY);
    if (!hit) {
      const nodes = elementChildren(tree).filter((child) => child !== dropLine && child.matches(`.${groupClass}, ${rowSelector}`));
      const last = nodes.at(-1);
      if (!last || last === dragNode || !fitsDepth(0)) return;
      drop = { parent: tree, before: null };
      const row = last.classList.contains(groupClass) ? last.querySelector<HTMLElement>(`.${folderRowClass}`) : last;
      if (row) showLine(last, true, Number.parseFloat(getComputedStyle(row).paddingLeft));
      return;
    }
    const node = nodeOf(hit.row);
    if (node === dragNode || dragNode.contains(node)) return;
    const sector = Math.min(3, Math.max(0, Math.floor(((event.clientY - hit.rect.top) / hit.rect.height) * 4)));
    if (hit.row.classList.contains(folderRowClass) && sector > 0 && sector < 3) {
      if (!fitsDepth(folderDepth(node))) return;
      hit.row.classList.add('droptarget');
      drop = { folder: node };
      if (!node.classList.contains('on')) autoExpandTimer = window.setTimeout(() => node.classList.add('on'), 500);
      return;
    }
    const parent = node.parentElement;
    if (!parent || !fitsDepth(folderDepth(parent))) return;
    drop = { parent, before: sector < 2 ? node : node.nextElementSibling };
    showLine(node, sector >= 2, Number.parseFloat(getComputedStyle(hit.row).paddingLeft));
  };
  const onDrop = (event: DragEvent): void => {
    if (!dragNode || !drop) return;
    event.preventDefault();
    if (drop.folder) {
      drop.folder.querySelector<HTMLElement>(`.${groupBodyClass}`)?.appendChild(dragNode);
      drop.folder.classList.add('on');
      dragNode.dataset.reopen = '1';
    } else if (drop.parent) {
      drop.parent.insertBefore(dragNode, drop.before ?? null);
    }
    finish();
  };
  tree.addEventListener('dragstart', onDragStart);
  tree.addEventListener('dragover', onDragOver);
  tree.addEventListener('drop', onDrop);
  tree.addEventListener('dragend', finish);
  return () => {
    tree.removeEventListener('dragstart', onDragStart);
    tree.removeEventListener('dragover', onDragOver);
    tree.removeEventListener('drop', onDrop);
    tree.removeEventListener('dragend', finish);
    finish();
  };
}

interface TreeSearchOptions {
  readonly input: HTMLInputElement | null;
  readonly tree: HTMLElement | null;
  readonly groupClass: string;
  readonly rowSelector: string;
  readonly nameSelector: string;
}

export function installTreeSearch(options: TreeSearchOptions): () => void {
  const { input, tree, groupClass, rowSelector, nameSelector } = options;
  if (!input || !tree) return () => undefined;
  const empty = tree.querySelector<HTMLElement>('.searchempty');
  const nameOf = (node: Element): HTMLElement | null => node.querySelector<HTMLElement>(nameSelector);
  const rawText = (element: HTMLElement): string => {
    if (element.dataset.raw === undefined) element.dataset.raw = element.textContent ?? '';
    return element.dataset.raw;
  };
  const paint = (node: Element, keyword: string): boolean => {
    const element = nameOf(node);
    if (!element) return false;
    const text = rawText(element);
    const index = keyword ? text.toLowerCase().indexOf(keyword) : -1;
    element.replaceChildren(document.createTextNode(text));
    if (index < 0) return false;
    const mark = document.createElement('mark');
    mark.className = 'searchhit';
    mark.textContent = text.slice(index, index + keyword.length);
    element.replaceChildren(text.slice(0, index), mark, text.slice(index + keyword.length));
    return true;
  };
  const onInput = (): void => {
    const keyword = input.value.trim().toLowerCase();
    const groups = Array.from(tree.querySelectorAll<HTMLElement>(`.${groupClass}`));
    const rows = Array.from(tree.querySelectorAll<HTMLElement>(rowSelector));
    const heads = groups.map((group) => group.querySelector<HTMLElement>(`.${groupClass}-h`) ?? group.firstElementChild as HTMLElement);
    if (!keyword) {
      [...groups, ...rows].forEach((node) => node.classList.remove('searchhidden'));
      [...rows, ...heads].forEach((node) => paint(node, ''));
      groups.forEach((group) => {
        if (group.dataset.wasopen === undefined) return;
        group.classList.toggle('on', group.dataset.wasopen === '1');
        delete group.dataset.wasopen;
      });
      empty?.classList.remove('on');
      return;
    }
    groups.forEach((group) => { group.dataset.wasopen ??= group.classList.contains('on') ? '1' : ''; });
    let hits = 0;
    rows.forEach((row) => {
      const hit = paint(row, keyword);
      if (hit) hits += 1;
      row.classList.toggle('searchhidden', !hit);
    });
    groups.toReversed().forEach((group) => {
      const head = group.querySelector<HTMLElement>(`.${groupClass}-h`) ?? group.firstElementChild as HTMLElement;
      const selfHit = paint(head, keyword);
      const childVisible = Array.from(group.querySelectorAll<HTMLElement>(`${rowSelector}, .${groupClass}`))
        .some((node) => !node.classList.contains('searchhidden'));
      if (selfHit) {
        group.querySelectorAll(rowSelector).forEach((row) => row.classList.remove('searchhidden'));
        hits += 1;
      }
      group.classList.toggle('searchhidden', !selfHit && !childVisible);
      group.classList.add('on');
    });
    empty?.classList.toggle('on', hits === 0);
  };
  input.addEventListener('input', onInput);
  return () => input.removeEventListener('input', onInput);
}