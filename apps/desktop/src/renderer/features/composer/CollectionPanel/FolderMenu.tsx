import { FilePlus, FolderPlus, Pencil, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { cx } from '../../../components/share/cx';
import { useComposerStore } from '../data/composerStore';

import styles from './FolderMenu.module.css';

export interface FolderMenuProps {
  folderId: string;
}

/** 目录行的操作菜单；条目只有图标与文字，不带 MenuItem 的 hint 列。 */
export function FolderMenu({ folderId }: FolderMenuProps): React.JSX.Element {
  const { t } = useTranslation();
  const setRenamingNode = useComposerStore((state) => state.setRenamingNode);
  const setTargetFolder = useComposerStore((state) => state.setTargetFolder);
  const setFolderMenu = useComposerStore((state) => state.setFolderMenu);
  const createFolder = useComposerStore((state) => state.createFolder);
  const createRequest = useComposerStore((state) => state.createRequest);
  const deleteNode = useComposerStore((state) => state.deleteNode);

  return (
    <>
      <button
        type="button"
        className={styles.item}
        onClick={() => setRenamingNode(folderId)}
      >
        <Pencil strokeWidth={1.9} />
        {t('composer.renameFolder')}
      </button>
      <button
        type="button"
        className={styles.item}
        onClick={() => {
          setTargetFolder(folderId);
          createFolder(t('composer.untitledFolder'));
        }}
      >
        <FolderPlus strokeWidth={1.9} />
        {t('composer.newSubfolder')}
      </button>
      <button
        type="button"
        className={styles.item}
        onClick={() => {
          setTargetFolder(folderId);
          createRequest();
          setFolderMenu(null);
        }}
      >
        <FilePlus strokeWidth={1.9} />
        {t('composer.newRequest')}
      </button>
      <div className={styles.separator} />
      <button
        type="button"
        className={cx(styles.item, styles.danger)}
        onClick={() => deleteNode(folderId)}
      >
        <Trash2 strokeWidth={1.9} />
        {t('composer.deleteFolder')}
      </button>
    </>
  );
}
