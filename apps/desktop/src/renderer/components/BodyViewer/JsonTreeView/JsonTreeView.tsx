import { useVirtualizer } from '@tanstack/react-virtual';
import { Copy, Route } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { cx } from '../../share/cx';
import { useClipboardCopy } from '../../share/useClipboardCopy';
import {
  type JsonNode,
  defaultExpanded,
  flattenJson,
  isContainer,
  valueAtPath,
} from './jsonTree';
import { JsonTreeRow } from './JsonTreeRow';
import styles from './JsonTreeView.module.css';

const ROW_HEIGHT = 22;
const MENU_WIDTH = 176;
const MENU_HEIGHT = 108;

interface JsonTreeViewProps {
  root: unknown;
  compact?: boolean;
  parityId?: string;
}

/** 虚拟化的 JSON 树：折叠的子树不产生行，右键可复制值、子树或路径。 */
export function JsonTreeView({ root, compact = false, parityId }: JsonTreeViewProps): React.JSX.Element {
  const { t } = useTranslation();
  const copy = useClipboardCopy();
  const hostRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(() => defaultExpanded(root));
  const [menu, setMenu] = useState<{ node: JsonNode; top: number; left: number } | null>(null);

  useEffect(() => {
    setExpanded(defaultExpanded(root));
    setMenu(null);
  }, [root]);

  useEffect(() => {
    if (!menu) {
      return;
    }
    const close = (): void => setMenu(null);
    document.addEventListener('click', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('click', close);
      document.removeEventListener('keydown', close);
    };
  }, [menu]);

  const rows = useMemo(() => flattenJson(root, expanded), [root, expanded]);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => hostRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  const openMenu = (event: React.MouseEvent, node: JsonNode): void => {
    event.preventDefault();
    const host = hostRef.current;
    if (!host || node.closing) {
      return;
    }
    const bounds = host.getBoundingClientRect();
    setMenu({
      node,
      top: Math.min(event.clientY - bounds.top + host.scrollTop, host.scrollHeight - MENU_HEIGHT),
      left: Math.min(event.clientX - bounds.left, bounds.width - MENU_WIDTH),
    });
  };

  const toggle = (path: string): void => {
    setExpanded((current) => {
      const next = new Set(current);
      if (!next.delete(path)) {
        next.add(path);
      }
      return next;
    });
  };

  return (
    <div ref={hostRef} className={cx(styles.host, compact && styles.compact)} data-parity={parityId}>
      <div className={styles.rows} style={{ height: `${virtualizer.getTotalSize()}px` }}>
        {virtualizer.getVirtualItems().map((item) => {
          const node = rows[item.index]!;
          return (
            <div
              key={item.key}
              className={styles.slot}
              style={{ transform: `translateY(${item.start}px)` }}
            >
              <JsonTreeRow
                node={node}
                expanded={expanded.has(node.path)}
                selected={menu?.node.path === node.path}
                onToggle={toggle}
                onContextMenu={openMenu}
              />
            </div>
          );
        })}
      </div>
      {menu ? (
        <div className={styles.menu} style={{ top: `${menu.top}px`, left: `${menu.left}px` }}>
          <button type="button" className={styles.item} onClick={() => copyValue(menu.node)}>
            <Copy size={14} strokeWidth={1.9} />
            {t('body.copyValue')}
          </button>
          <button type="button" className={styles.item} onClick={() => copyObject(menu.node)}>
            <Copy size={14} strokeWidth={1.9} />
            {t('body.copyObject')}
          </button>
          <button type="button" className={styles.item} onClick={() => copy(menu.node.path)}>
            <Route size={14} strokeWidth={1.9} />
            {t('body.copyPath')}
          </button>
        </div>
      ) : null}
    </div>
  );

  function copyValue(node: JsonNode): void {
    const value = valueAtPath(root, node.path);
    copy(
      isContainer(node.kind) || typeof value !== 'string'
        ? JSON.stringify(value, null, 2)
        : value,
    );
  }

  function copyObject(node: JsonNode): void {
    copy(JSON.stringify(valueAtPath(root, node.path), null, 2));
  }
}
