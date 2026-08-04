import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import styles from './MarkdownView.module.css';

interface MarkdownViewProps {
  source: string;
  parityId?: string;
}

/**
 * 渲染抓到的 Markdown。react-markdown 默认不渲染正文里的原始 HTML，
 * 这正是这里需要的：正文来自不可信流量，不能让它注入节点。
 */
export function MarkdownView({ source, parityId }: MarkdownViewProps): React.JSX.Element {
  return (
    <div className={styles.host} data-parity={parityId}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{source}</ReactMarkdown>
    </div>
  );
}
