import type { LucideIcon } from 'lucide-react';

import type { AutomationId } from '../../../../shared/automation-ids';

import styles from './FileCommand.module.css';

export interface FileCommandProps {
  icon: LucideIcon;
  label: string;
  /** 尾部的文件扩展名提示，如 `.har`。 */
  extension: string;
  automationId: AutomationId;
  onClick(): void;
}

/** Import 或 Export 弹层里的单条文件命令。 */
export function FileCommand({
  icon: Icon,
  label,
  extension,
  automationId,
  onClick,
}: FileCommandProps): React.JSX.Element {
  return (
    <button
      type="button"
      role="menuitem"
      className={styles.fileCommand}
      onClick={onClick}
      data-automation-id={automationId}
    >
      <Icon size={16} strokeWidth={1.9} />
      <span>{label}</span>
      <code>{extension}</code>
    </button>
  );
}
