import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';

import styles from './WebSocketMessageTree.module.css';

interface WebSocketMessageTreeProps {
  readonly source: string;
  readonly fullscreen?: boolean;
}

export function WebSocketMessageTree({ source, fullscreen = false }: WebSocketMessageTreeProps): React.JSX.Element {
  const [open, setOpen] = useState(true);
  const entries = Object.entries(JSON.parse(source) as Record<string, string | number>);

  return (
    <div className={`${styles.webSocketMessageTree} ${fullscreen ? styles.webSocketMessageTreeFullscreen : ''}`} role="tree" aria-label="Message JSON">
      <div
        className={styles.webSocketMessageTreeRow}
        role="treeitem"
        aria-expanded={open}
      >
        <span className={styles.webSocketMessageTreeDisclosure}>
          <button
            type="button"
            className={styles.webSocketMessageTreeToggle}
            aria-expanded={open}
            aria-label="Message object"
            onClick={() => setOpen(!open)}
          >
            {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
        </span>
        <span className={open ? styles.webSocketMessageTreePunctuation : styles.webSocketMessageTreeSummary}>{open ? '{' : '{…}'}</span>
        <span className={styles.webSocketMessageTreeSummary}>{entries.length} keys</span>
      </div>
      {open ? (
        <div role="group">
          {entries.map(([key, value]) => (
            <div className={styles.webSocketMessageTreeChild} role="treeitem" key={key}>
              <span className={styles.webSocketMessageTreeDisclosure} />
              <span className={styles.webSocketMessageTreeKey}>{key}</span>
              <span className={styles.webSocketMessageTreePunctuation}>:</span>
              <span className={typeof value === 'string' ? styles.webSocketMessageTreeString : styles.webSocketMessageTreeNumber}>
                {JSON.stringify(value)}
              </span>
            </div>
          ))}
          <div className={styles.webSocketMessageTreeRow} role="treeitem">
            <span className={styles.webSocketMessageTreeDisclosure} />
            <span className={styles.webSocketMessageTreePunctuation}>{'}'}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}