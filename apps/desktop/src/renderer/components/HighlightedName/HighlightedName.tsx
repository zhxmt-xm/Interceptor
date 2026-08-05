import styles from './HighlightedName.module.css';

export interface HighlightedNameProps {
  name: string;
  /** 已规范化的小写关键词；空串表示不高亮。 */
  keyword: string;
  className?: string;
}

/** 名称行：命中关键词的那一段加底色，其余原样。 */
export function HighlightedName({
  name,
  keyword,
  className,
}: HighlightedNameProps): React.JSX.Element {
  const index = keyword ? name.toLowerCase().indexOf(keyword) : -1;
  if (index === -1) {
    return <span className={className}>{name}</span>;
  }
  return (
    <span className={className}>
      {name.slice(0, index)}
      <mark className={styles.hit}>{name.slice(index, index + keyword.length)}</mark>
      {name.slice(index + keyword.length)}
    </span>
  );
}
