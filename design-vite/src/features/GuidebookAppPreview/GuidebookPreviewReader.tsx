import { Button, Image } from 'antd';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { FixtureIcon } from '../../fixtures/FixtureIcon';
import { useDesignState } from '../../state/useDesignState';
import { HomepageGuideOutlinePreview } from '../HomepageGuidePreview/HomepageGuideOutlinePreview';
import { HomepageGuideSearchDialog } from '../HomepageGuidePreview/HomepageGuideSearchDialog';
import {
  GUIDEBOOK_PREVIEW_CHAPTERS, GUIDEBOOK_PREVIEW_COPY, GUIDEBOOK_PREVIEW_IMAGE,
  guidebookPreviewHeadings, guidebookPreviewLocale, guidebookPreviewSearch,
} from './utils';
import styles from './GuidebookPreviewReader.module.css';

export function GuidebookPreviewReader(): React.JSX.Element {
  const { state, updateState } = useDesignState();
  const [readerElement, setReaderElement] = useState<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const locale = guidebookPreviewLocale(state.lang);
  const copy = GUIDEBOOK_PREVIEW_COPY[locale];
  const article = state.guidebookPreviewPage === 'mcp';
  const headings = useMemo(() => guidebookPreviewHeadings(locale), [locale]);
  const results = useMemo(() => guidebookPreviewSearch(state.guidebookPreviewSearchQuery, locale),
    [state.guidebookPreviewSearchQuery, locale]);
  const getScrollRoot = useCallback(() => scrollRef.current, []);
  const onActive = useCallback((guidebookPreviewSection: string) => updateState({ guidebookPreviewSection }), [updateState]);
  const openSearch = useCallback(() => {
    if (state.guidebookPreviewSearchOpen
      || [...document.querySelectorAll('[role="dialog"]')].some(dialog => dialog.checkVisibility())) return;
    updateState({ guidebookPreviewSearchOpen: true });
  }, [state.guidebookPreviewSearchOpen, updateState]);

  useEffect(() => {
    const onSearchShortcut = (event: KeyboardEvent): void => {
      if (!event.isComposing && !event.altKey
        && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        openSearch();
      }
    };
    window.addEventListener('keydown', onSearchShortcut);
    return () => window.removeEventListener('keydown', onSearchShortcut);
  }, [openSearch]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [state.guidebookPreviewPage]);

  return (
    <div className={styles.gbpReader} ref={setReaderElement} data-design-guidebook-page={state.guidebookPreviewPage}>
      <aside className={styles.gbpChapters}>
        <Button block data-design-guidebook-search=""
          icon={<FixtureIcon iconId="i-search" svgProps={{ size: 15 }} />}
          onClick={openSearch}>{copy.search}<kbd>⌘ K</kbd></Button>
        <p className={styles.gbpEyebrow}>{copy.chapterLabel}</p>
        <button type="button" className={styles.gbpChapter} data-selected={!article}
          data-design-guidebook-chapter="overview" onClick={() => updateState({
            guidebookPreviewPage: 'overview', guidebookPreviewSearchOpen: false, guidebookPreviewImageOpen: false,
          })}>{copy.overview}</button>
        {GUIDEBOOK_PREVIEW_CHAPTERS.map(([id, en, zh], index) => id === 'mcp' ? (
          <button key={id} type="button" className={styles.gbpChapter} data-selected={article}
            data-design-guidebook-chapter={id} onClick={() => updateState({
              guidebookPreviewPage: 'mcp', guidebookPreviewSearchOpen: false, guidebookPreviewImageOpen: false,
            })}><span className={styles.gbpChapterNumber}>{String(index + 1).padStart(2, '0')}</span>{locale === 'en' ? en : zh}</button>
        ) : (
          <span className={styles.gbpChapterLabel} key={id}>
            <span className={styles.gbpChapterNumber}>{String(index + 1).padStart(2, '0')}</span>{locale === 'en' ? en : zh}
          </span>
        ))}
      </aside>
      <div className={styles.gbpArticleScroll} ref={scrollRef} tabIndex={0}
        role="region" aria-label={article ? copy.articleTitle : copy.overview}
        data-design-guidebook-scroll="">
        {!article ? (
          <article className={styles.gbpArticle}>
            <p className={styles.gbpEyebrow}>INTERCEPTOR · {copy.shell}</p>
            <h1>{copy.overviewTitle}</h1>
            <p className={styles.gbpLead}>{copy.overviewLead}</p>
            <section className={styles.gbpOverviewSection}>
              <h2>{copy.groupOne}</h2>
              <div className={styles.gbpTopics}>
                <div><FixtureIcon iconId="i-activity" svgProps={{ size: 22 }} /><h3>Capture</h3><p>{copy.cardCapture}</p></div>
                <div><FixtureIcon iconId="i-branch" svgProps={{ size: 22 }} /><h3>Rules & Breakpoints</h3><p>{copy.cardRules}</p></div>
              </div>
            </section>
            <section className={styles.gbpOverviewSection}>
              <h2>{copy.groupTwo}</h2>
              <div className={styles.gbpTopics}>
                <div><FixtureIcon iconId="i-bot" svgProps={{ size: 22 }} /><h3>Agent</h3><p>{copy.cardAgent}</p></div>
                <div><FixtureIcon iconId="i-globe" svgProps={{ size: 22 }} /><h3>MCP</h3><p>{copy.cardMcp}</p>
                  <Button type="link" data-design-guidebook-read-mcp="" style={{ color: 'var(--accent)', paddingInline: 0 }}
                    onClick={() => updateState({ guidebookPreviewPage: 'mcp' })}>
                    {copy.readMcp}<FixtureIcon iconId="i-arrow" svgProps={{ size: 15 }} />
                  </Button>
                </div>
              </div>
            </section>
          </article>
        ) : (
          <article className={styles.gbpArticle}>
            <p className={styles.gbpBreadcrumb}>{copy.shell}<span>/</span>MCP</p>
            <h1>{copy.articleTitle}</h1>
            <p className={styles.gbpLead}>{copy.articleLead}</p>
            <section id="gbp-connect" className={styles.gbpSection}>
              <h2>{copy.connect}</h2>
              <p>{copy.connectBody}</p>
              <p>{copy.connectStep}</p>
              <figure className={styles.gbpFigure}>
                <Image src={GUIDEBOOK_PREVIEW_IMAGE} alt={copy.caption} width="100%"
                  classNames={{ root: styles.gbpImage, popup: { root: styles.gbpImagePopup } }}
                  styles={{ image: { width: '100%', height: 'auto' }, popup: { root: { position: 'absolute' }, mask: { position: 'absolute' } } }}
                  preview={{
                    open: state.guidebookPreviewImageOpen && readerElement !== null,
                    onOpenChange: guidebookPreviewImageOpen => updateState({ guidebookPreviewImageOpen }),
                    getContainer: readerElement ?? false,
                  }}
                  onLoad={() => updateState({ guidebookPreviewImageError: false })}
                  onError={() => updateState({ guidebookPreviewImageError: true })}
                />
                {state.guidebookPreviewImageError && <p className={styles.gbpImageError} role="alert">{copy.imageError}</p>}
                <figcaption>{copy.caption}</figcaption>
              </figure>
            </section>
            <section id="gbp-approve" className={styles.gbpSection}>
              <h2>{copy.approve}</h2>
              <p>{copy.approveBody}</p>
              <p>{copy.autoBody}</p>
            </section>
            <section id="gbp-cleanup" className={styles.gbpSection}>
              <h2>{copy.cleanup}</h2>
              <p>{copy.cleanupBody}</p>
            </section>
          </article>
        )}
      </div>
      {article && <div className={styles.gbpOutline} onClick={event => {
        if (!(event.target instanceof Element)) return;
        const anchor = event.target.closest<HTMLAnchorElement>('a[href^="#gbp-"]');
        if (!anchor) return;
        event.preventDefault();
        const target = document.getElementById(anchor.hash.slice(1));
        if (!target) throw new Error('The Guidebook preview outline target is missing.');
        target.scrollIntoView({ block: 'start' });
      }}>
        <HomepageGuideOutlinePreview headings={headings} locale={locale} contained
          activeId={state.guidebookPreviewSection} onActive={onActive} getScrollRoot={getScrollRoot} />
      </div>}
      <HomepageGuideSearchDialog open={state.guidebookPreviewSearchOpen}
        query={state.guidebookPreviewSearchQuery} locale={locale} entries={results} contained
        onQuery={guidebookPreviewSearchQuery => updateState({ guidebookPreviewSearchQuery })}
        onClose={() => updateState({ guidebookPreviewSearchOpen: false })}
        onSelect={href => {
          const id = href.slice(1);
          if (!headings.some(heading => heading.id === id)) throw new Error('Unknown Guidebook preview search target.');
          updateState({ guidebookPreviewPage: 'mcp', guidebookPreviewSearchOpen: false, guidebookPreviewSection: id });
          requestAnimationFrame(() => {
            const target = document.getElementById(id);
            if (!target) throw new Error('The Guidebook preview search target did not render.');
            target.scrollIntoView({ block: 'start' });
          });
        }}
      />
    </div>
  );
}
