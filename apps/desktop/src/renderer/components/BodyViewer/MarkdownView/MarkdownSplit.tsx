import { CodeViewer } from '../../CodeViewer/CodeViewer';
import { MarkdownView } from './MarkdownView';
import styles from './MarkdownSplit.module.css';

interface MarkdownSplitProps {
  source: string;
  parityId?: string;
}

/**
 * 预览在上、原文在下。Capture 唯一的 splitter 已经给了 list↔Inspector，
 * 所以这里是固定比例 + 一条 1px 分隔，不是可拖分栏。
 */
export function MarkdownSplit({ source, parityId }: MarkdownSplitProps): React.JSX.Element {
  return (
    <div className={styles.host} data-parity={parityId}>
      <MarkdownView source={source} />
      <CodeViewer value={source} language="markdown" />
    </div>
  );
}
