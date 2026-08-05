import { ChevronDown, Folder, MoreVertical } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { AutomationIdFactory } from '../../../../shared/automation-ids';
import { cx } from '../../../components';
import type { RuleFolder } from '../../../../shared/desktop-api';
import { useRulesStore } from '../data/rulesStore';
import { anchorFolderMenu } from '../utils';

import styles from './RuleFolderRow.module.css';

export interface RuleFolderRowProps {
  folder: RuleFolder;
  /** 树深度，决定行内缩进；顶层为 0。 */
  depth: number;
  expanded: boolean;
  dragging: boolean;
  /** 拖拽落点为「移入本目录」时整行高亮。 */
  dropTarget: boolean;
  /** 来自 useTreeDrag：整行即拖拽源。 */
  dragProps: {
    draggable: boolean;
    onDragStart: (event: React.DragEvent<HTMLElement>) => void;
    onDragEnd: () => void;
  };
}

/**
 * 树里的一个目录：只负责命名与折叠。启用、顺序与命中都属于里面的规则，
 * 因此这一行没有开关、没有计数，只有 chevron、名字和 hover 才出现的操作菜单。
 */
export function RuleFolderRow({
  folder,
  depth,
  expanded,
  dragging,
  dropTarget,
  dragProps,
}: RuleFolderRowProps): React.JSX.Element {
  const { t } = useTranslation();
  const toggleFolder = useRulesStore((state) => state.toggleFolder);
  const folderMenu = useRulesStore((state) => state.folderMenu);
  const setFolderMenu = useRulesStore((state) => state.setFolderMenu);
  const menuOpen = folderMenu?.folderId === folder.id;

  return (
    <div
      data-tree-row={folder.id}
      data-automation-id={AutomationIdFactory.ruleFolderRow(folder.id)}
      style={{ '--depth': depth } as React.CSSProperties}
      className={cx(
        styles.row,
        dragging && styles.dragging,
        dropTarget && styles.dropTarget,
        menuOpen && styles.menuOpen,
      )}
      {...dragProps}
    >
      <button
        type="button"
        className={styles.chevronButton}
        aria-label={expanded ? t('rules.collapseFolder') : t('rules.expandFolder')}
        onClick={() => toggleFolder(folder.id)}
        data-automation-id={AutomationIdFactory.ruleFolderToggle(folder.id)}
      >
        <ChevronDown
          className={cx(styles.chevron, expanded && styles.expanded)}
          strokeWidth={1.9}
        />
      </button>
      <Folder className={styles.icon} strokeWidth={1.9} />
      <span className={styles.name}>{folder.name}</span>
      <button
        type="button"
        className={styles.more}
        aria-label={t('rules.folderActions')}
        data-automation-id={AutomationIdFactory.ruleFolderMenu(folder.id)}
        onClick={(event) =>
          setFolderMenu(
            menuOpen ? null : anchorFolderMenu(event.currentTarget, folder.id),
          )
        }
      >
        <MoreVertical strokeWidth={1.9} />
      </button>
    </div>
  );
}
