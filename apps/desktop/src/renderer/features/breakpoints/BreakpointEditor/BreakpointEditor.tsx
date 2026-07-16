import { Clock, Play, Plus, Slash, X } from 'lucide-react';

import { Button, Chip, IconButton, SectionHeader } from '../../../components';
import {
  formatCountdown,
  selectedBreakpoint,
  useBreakpointsStore,
} from '../breakpointsStore';
import { resolveSelected } from '../useBreakpoints';
import styles from './BreakpointEditor.module.css';

/** Right breakpoints pane: editable headers/body for the paused request. */
export function BreakpointEditor(): React.JSX.Element {
  const draft = useBreakpointsStore((state) => state.draft);
  const breakpoint = useBreakpointsStore(selectedBreakpoint);
  const resolving = useBreakpointsStore((state) => state.resolving);
  const setBody = useBreakpointsStore((state) => state.setBody);
  const addHeader = useBreakpointsStore((state) => state.addHeader);
  const updateHeader = useBreakpointsStore((state) => state.updateHeader);
  const removeHeader = useBreakpointsStore((state) => state.removeHeader);

  if (!draft || !breakpoint) {
    return (
      <div className={styles.editor}>
        <div className={styles.placeholder}>
          No request selected. Paused requests appear here for inspection and editing.
        </div>
      </div>
    );
  }

  const isResponse = draft.phase === 'response';

  return (
    <div className={styles.editor}>
      <div className={styles.head}>
        <Chip tone={isResponse ? 'green' : 'blue'}>
          {isResponse ? draft.statusCode : draft.method}
        </Chip>
        <span className={styles.url}>{draft.url || breakpoint.url || ''}</span>
        <span className={styles.phase}>{isResponse ? 'Response paused' : 'Request paused'}</span>
        <span className={styles.countdown}>
          <Clock size={13} strokeWidth={1.9} />
          {formatCountdown(breakpoint.deadline)}
        </span>
      </div>

      <div className={styles.scroll}>
        <div>
          <SectionHeader count="editable">Headers</SectionHeader>
          <div className={styles.headerHead}>
            <span>Name</span>
            <span>Value</span>
            <span />
          </div>
          {draft.headers.map((header) => (
            <div key={header.id} className={styles.headerRow}>
              <input
                className={styles.cellInput}
                aria-label="Header name"
                value={header.name}
                spellCheck={false}
                onChange={(event) => updateHeader(header.id, { name: event.target.value })}
              />
              <input
                className={styles.cellInput}
                aria-label="Header value"
                value={header.value}
                spellCheck={false}
                onChange={(event) => updateHeader(header.id, { value: event.target.value })}
              />
              <IconButton
                icon={X}
                label="Remove header"
                size="sm"
                strokeWidth={2.2}
                onClick={() => removeHeader(header.id)}
              />
            </div>
          ))}
          <button type="button" className={styles.addHeader} onClick={addHeader}>
            <Plus size={12} strokeWidth={2} />
            Add header
          </button>
        </div>

        <div>
          <SectionHeader count="json · editable">Body</SectionHeader>
          <textarea
            className={styles.bodyEdit}
            aria-label="Body"
            value={draft.body}
            spellCheck={false}
            onChange={(event) => setBody(event.target.value)}
          />
        </div>
      </div>

      <div className={styles.foot}>
        <Button
          icon={Slash}
          variant="danger"
          disabled={resolving}
          onClick={() => void resolveSelected('drop', false)}
        >
          Drop
        </Button>
        <span className={styles.spacer} />
        <Button disabled={resolving} onClick={() => void resolveSelected('continue', false)}>
          Continue unmodified
        </Button>
        <Button
          icon={Play}
          variant="primary"
          disabled={resolving}
          onClick={() => void resolveSelected('continue', true)}
        >
          Execute edited
        </Button>
      </div>
    </div>
  );
}
