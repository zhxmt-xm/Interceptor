import { Button, ConfigProvider, Input, Modal, type InputRef } from 'antd';
import { useEffect, useId, useRef, useState } from 'react';
import { FixtureIcon } from '../../fixtures/FixtureIcon';
import {
  GUIDE_SEARCH_PREVIEW_COPY,
  GUIDE_SEARCH_PREVIEW_THEME,
  guidePreviewHighlights,
  searchGuidePreview,
  type GuideSearchPreviewLocale,
  type GuideSearchPreviewResult,
} from './utils';
import styles from './HomepageGuideSearchDialog.module.css';

export function HomepageGuideSearchDialog({ open, query, locale, onQuery, onClose, onSelect, container, entries, contained = false }: {
  open: boolean;
  query: string;
  locale: GuideSearchPreviewLocale;
  onQuery: (query: string) => void;
  onClose: () => void;
  onSelect: (href: string) => void;
  container?: () => HTMLElement;
  entries?: readonly GuideSearchPreviewResult[];
  contained?: boolean;
}): React.JSX.Element {
  const copy = GUIDE_SEARCH_PREVIEW_COPY[locale];
  const inputRef = useRef<InputRef>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [activeIndex, setActiveIndex] = useState(0);
  const results = entries ?? searchGuidePreview(query, locale);
  const selectedIndex = Math.min(activeIndex, results.length - 1);

  useEffect(() => {
    if (open) listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [open, selectedIndex, query]);

  return (
    <ConfigProvider theme={GUIDE_SEARCH_PREVIEW_THEME} componentSize="middle">
    <Modal
      open={open}
      title={copy.title}
      width={680}
      footer={null}
      onCancel={onClose}
      getContainer={contained ? false : container}
      afterOpenChange={(visible) => { if (visible) inputRef.current?.focus(); }}
      className={styles.hgsDialog}
      classNames={{ body: styles.hgsBody }}
      style={{ top: contained ? 'var(--gbp-space-lg)' : 'var(--hgs-dialog-top)', maxWidth: '100%', margin: '0 auto' }}
      styles={{
        wrapper: { padding: '16px', ...(contained ? { position: 'absolute' } : {}) },
        ...(contained ? { mask: { position: 'absolute' as const } } : {}),
        container: { padding: 'var(--hgs-dialog-padding)' },
      }}
    >
      <div data-automation-id="guide.search.dialog" className={styles.hgsContent}>
        <Input
          ref={inputRef}
          value={query}
          size="large"
          allowClear
          prefix={<FixtureIcon iconId="i-search" svgProps={{ size: 18 }} />}
          placeholder={copy.placeholder}
          aria-label={copy.title}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={Boolean(results.length)}
          aria-controls={listId}
          aria-activedescendant={selectedIndex >= 0 ? `${listId}-${selectedIndex}` : undefined}
          data-automation-id="guide.search.input"
          onChange={(event) => { setActiveIndex(0); onQuery(event.target.value); }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (results.length && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
              event.preventDefault();
              setActiveIndex((selectedIndex + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length);
            }
            if (event.key === 'Enter' && results[selectedIndex]) {
              event.preventDefault();
              onSelect(results[selectedIndex].href);
            }
          }}
        />
        <div className={styles.hgsSummary}>
          <span>{copy.scope}</span>
          <span role="status">{query.trim() ? `${results.length} ${copy.results}` : ''}</span>
        </div>
        <div className={styles.hgsResults} ref={listRef} id={listId} role="listbox" aria-label={copy.title}>
          {results.map((result, index) => (
            <a
              key={result.href}
              href={result.href}
              id={`${listId}-${index}`}
              className={styles.hgsResult}
              role="option"
              aria-selected={index === selectedIndex}
              tabIndex={-1}
              data-automation-id="guide.search.result"
              onMouseEnter={() => setActiveIndex(index)}
              onClick={(event) => {
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                event.preventDefault();
                onSelect(result.href);
              }}
            >
              <FixtureIcon iconId="i-file-text" svgProps={{ size: 18 }} />
              <div className={styles.hgsResultCopy}>
                <small>{result.chapter}</small>
                <strong>{guidePreviewHighlights(result.title, query).map((part, partIndex) => part.matched ? <mark key={partIndex}>{part.text}</mark> : part.text)}</strong>
                <p>{guidePreviewHighlights(result.text, query).map((part, partIndex) => part.matched ? <mark key={partIndex}>{part.text}</mark> : part.text)}</p>
              </div>
              <FixtureIcon iconId="i-arrow" svgProps={{ size: 16 }} />
            </a>
          ))}
        </div>
        {!results.length && (
          <div className={styles.hgsEmpty} data-automation-id="guide.search.empty">
            <FixtureIcon iconId={query.trim() ? 'i-search' : 'i-book-open'} svgProps={{ size: 28 }} />
            <strong>{query.trim() ? copy.noResults : copy.empty}</strong>
            <p>{query.trim() ? copy.retry : copy.hint}</p>
            {!query.trim() && (
              <div className={styles.hgsExamples}>
                {copy.examples.map((example) => (
                  <Button key={example} onClick={() => { setActiveIndex(0); onQuery(example); inputRef.current?.focus(); }}>{example}</Button>
                ))}
              </div>
            )}
          </div>
        )}
        <div className={styles.hgsFooter}>
          <span><kbd>↑ ↓</kbd>{copy.navigate}</span>
          <span><kbd>Enter</kbd>{copy.open}</span>
          <span><kbd>Esc</kbd>{copy.close}</span>
        </div>
      </div>
    </Modal>
    </ConfigProvider>
  );
}
