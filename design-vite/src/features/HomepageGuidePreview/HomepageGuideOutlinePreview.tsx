import { useEffect, useLayoutEffect, useRef } from 'react';
import styles from './HomepageGuideOutlinePreview.module.css';

interface Props {
  headings: readonly { id: string; title: string }[];
  locale: 'zh' | 'en';
  activeId: string;
  onActive: (id: string) => void;
  getScrollRoot?: () => HTMLElement | null;
}

export function HomepageGuideOutlinePreview({
  headings, locale, activeId, onActive, getScrollRoot,
}: Props): React.JSX.Element {
  const outlineRef = useRef<HTMLElement>(null);
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;

  useEffect(() => {
    const root = getScrollRoot ? getScrollRoot() : document.documentElement;
    if (!root) throw new Error('Guide outline preview has no scroll container.');
    const targets = headings.map((heading) => {
      const element = document.getElementById(`guide-anchor-${heading.id}`)
        ?? document.getElementById(`guide-heading-${heading.id}`)
        ?? document.getElementById(heading.id);
      if (!element) throw new Error(`Guide outline preview target is missing: ${heading.id}`);
      return { id: heading.id, element };
    });
    const eventTarget = getScrollRoot ? root : window;
    let frame = 0;
    let mounted = true;
    const update = (): void => {
      frame = 0;
      const padding = Number.parseFloat(getComputedStyle(root).scrollPaddingTop);
      if (!Number.isFinite(padding)) throw new Error('Guide outline preview needs an explicit scroll padding.');
      const line = (getScrollRoot ? root.getBoundingClientRect().top : 0) + padding;
      let next = targets[0]?.id ?? '';
      for (const target of targets) {
        const margin = Number.parseFloat(getComputedStyle(target.element).scrollMarginTop);
        if (Math.floor(target.element.getBoundingClientRect().top - margin) <= Math.floor(line)) {
          next = target.id;
        }
      }
      if (root.scrollHeight > root.clientHeight && Math.ceil(root.scrollTop + root.clientHeight) >= root.scrollHeight) {
        next = targets.at(-1)?.id ?? '';
      }
      if (next !== activeIdRef.current) {
        activeIdRef.current = next;
        onActive(next);
      }
    };
    const schedule = (): void => {
      if (!frame && mounted) frame = requestAnimationFrame(update);
    };
    eventTarget.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    const observer = new ResizeObserver(schedule);
    const article = targets[0]?.element.closest('article');
    if (article) observer.observe(article);
    update();
    void document.fonts.ready.then(schedule);
    return () => {
      mounted = false;
      cancelAnimationFrame(frame);
      observer.disconnect();
      eventTarget.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [headings, onActive, getScrollRoot]);

  useLayoutEffect(() => {
    const outline = outlineRef.current;
    if (!outline) return;
    let mounted = true;
    const reveal = (): void => {
      const current = outline.querySelector<HTMLElement>('[aria-current="location"]');
      if (!current || !outline.clientHeight) return;
      const bounds = outline.getBoundingClientRect();
      const item = current.getBoundingClientRect();
      if (item.top < bounds.top) outline.scrollTop += item.top - bounds.top;
      else if (item.bottom > bounds.bottom) outline.scrollTop += item.bottom - bounds.bottom;
    };
    const observer = new ResizeObserver(reveal);
    observer.observe(outline);
    reveal();
    void document.fonts.ready.then(() => { if (mounted) reveal(); });
    return () => {
      mounted = false;
      observer.disconnect();
    };
  }, [activeId, headings]);

  return (
    <nav
      ref={outlineRef}
      className={styles.hgoOutline}
      aria-label={locale === 'en' ? 'On this page' : '本章内容'}
      data-automation-id="guide.outline"
      data-design-preview="guide-outline"
    >
      <p>{locale === 'en' ? 'On this page' : '本章内容'}</p>
      {headings.map((heading) => (
        <a
          className={styles.hgoLink}
          href={`#${encodeURIComponent(heading.id)}`}
          key={heading.id}
          aria-current={activeId === heading.id ? 'location' : undefined}
        >
          {heading.title}
        </a>
      ))}
    </nav>
  );
}
