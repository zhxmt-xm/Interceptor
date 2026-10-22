import { useCallback, useEffect, useRef } from 'react';

import logo from '../../../../apps/desktop/assets/interceptor-icon.png';
import { FixtureIcon } from '../../fixtures/FixtureIcon';
import { useDesignState } from '../../state/useDesignState';
import { GUIDE_PREVIEW_CHAPTERS, GUIDE_PREVIEW_GROUPS, GUIDE_PREVIEW_OUTLINE } from './utils';
import { HomepageGuideSearchDialog } from './HomepageGuideSearchDialog';
import { HomepageGuideSearchTrigger } from './HomepageGuideSearchTrigger';
import { HomepageGuideOutlinePreview } from './HomepageGuideOutlinePreview';
import styles from './HomepageGuidePreview.module.css';

export function HomepageGuidePreview(): React.JSX.Element {
  const { state, updateState } = useDesignState();
  const scrollRef = useRef<HTMLDivElement>(null);
  const page = state.homepageGuidePage;
  const article = page === 'capture';
  const searchLocale = state.lang === 'en' ? 'en' : 'zh';
  const getOutlineScrollRoot = useCallback(() => scrollRef.current, []);
  const setOutlineActive = useCallback((homepageGuideOutlineActive: string) => {
    updateState({ homepageGuideOutlineActive });
  }, [updateState]);
  useEffect(() => {
    if (!state.homepageGuideSearchPreview) return;
    const openSearch = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        updateState({ homepageGuideSearchOpen: true });
      }
    };
    window.addEventListener('keydown', openSearch);
    return () => window.removeEventListener('keydown', openSearch);
  }, [state.homepageGuideSearchPreview, updateState]);
  const open = (next: 'overview' | 'capture' | 'resources'): void => {
    updateState({ homepageGuidePage: next });
    scrollRef.current?.scrollTo({ top: 0, behavior: 'instant' });
  };

  return (
    <div className={styles.hppRoot} ref={scrollRef} data-homepage-guide-page={page}>
      <header className={styles.hppHeader}>
        <div className={styles.hppHeaderInner}>
          <button className={styles.hppBrand} type="button" onClick={() => open('resources')}>
            <img src={logo} alt="" width="34" height="34" />
            <span>Interceptor<span className={styles.hppAccent}>.</span></span>
          </button>
          <nav className={styles.hppTopNav} aria-label="主导航">
            <button type="button" onClick={() => open('resources')}>产品能力</button>
            <button type="button" onClick={() => open('overview')}>使用指南</button>
          </nav>
          <div className={styles.hppHeaderActions}>
            <button type="button" aria-label="切换预览主题" onClick={() => updateState({ theme: state.theme === 'light' ? 'dark' : 'light' })}>
              <FixtureIcon iconId={state.theme === 'light' ? 'i-sun' : 'i-moon'} svgProps={{ size: 17 }} />
            </button>
            <span className={styles.hppLocale}>中文</span>
            <a className={styles.hppDownload} href="https://github.com/zhxmt-xm/Interceptor/releases/latest" target="_blank" rel="noopener noreferrer">
              下载 <FixtureIcon iconId="i-external" svgProps={{ size: 14 }} />
            </a>
          </div>
        </div>
      </header>

      {page === 'resources' ? (
        <main className={styles.hppResources}>
          <p className={styles.hppEyebrow}>A LITTLE GUIDANCE GOES A LONG WAY</p>
          <h1>下一步，从这里开始。</h1>
          <div className={styles.hppResourceGrid}>
            <article>
              <FixtureIcon iconId="i-external" svgProps={{ size: 22 }} />
              <h2>先掌握最重要的几步。</h2>
              <p>设置代理、检查 HTTPS、找到第一个请求，以及结束后的恢复方式，都在项目 README 中。</p>
              <a href="https://github.com/zhxmt-xm/Interceptor/blob/main/README.md#quick-start">阅读快速开始 ↗</a>
            </article>
            <article data-guidebook-entry>
              <FixtureIcon iconId="i-book-open" svgProps={{ size: 22 }} />
              <h2>完整使用指南。</h2>
              <p>中文教程初稿现已可阅读。按功能查找操作步骤和使用限制，真实产品截图与视频将继续补充。</p>
              <button type="button" onClick={() => open('overview')}>阅读教程 <FixtureIcon iconId="i-arrow" svgProps={{ size: 15 }} /></button>
            </article>
            <article>
              <FixtureIcon iconId="i-app-window" svgProps={{ size: 22 }} />
              <h2>看看它是如何工作的。</h2>
              <p>真实操作视频录制完成，并与发布版本核对后，会在这里提供各功能的演示入口。</p>
              <span>准备中</span>
            </article>
          </div>
        </main>
      ) : (
        <main className={styles.hppLayout}>
          <aside className={styles.hppSidebar} aria-label="教程章节">
            <p className={styles.hppSideTitle}>使用指南</p>
            {state.homepageGuideSearchPreview && <HomepageGuideSearchTrigger locale={searchLocale} onClick={() => updateState({ homepageGuideSearchOpen: true })} />}
            <button className={styles.hppChapter} data-selected={!article} type="button" onClick={() => open('overview')}>教程目录</button>
            {GUIDE_PREVIEW_CHAPTERS.map((chapter, index) => chapter === 'Capture' ? (
              <button className={styles.hppChapter} data-selected={article} key={chapter} type="button" onClick={() => open('capture')}>
                <span className={styles.hppChapterNumber}>{String(index + 1).padStart(2, '0')}</span>{chapter}
              </button>
            ) : (
              <span className={styles.hppChapter} key={chapter}>
                <span className={styles.hppChapterNumber}>{String(index + 1).padStart(2, '0')}</span>{chapter}
              </span>
            ))}
            <p className={styles.hppSidebarNote}>中文内容初稿<br />图片与视频持续补充</p>
          </aside>

          <section className={styles.hppReading}>
            {state.homepageGuideSearchPreview && (
              <div className={styles.hppMobileSearch}>
                <HomepageGuideSearchTrigger locale={searchLocale} onClick={() => updateState({ homepageGuideSearchOpen: true })} />
              </div>
            )}
            <div className={styles.hppMobileNavigation}>
              <button type="button" onClick={() => open('overview')}>教程目录</button>
              <span>/</span>
              <button type="button" onClick={() => open('capture')}>Capture</button>
            </div>
            <p className={styles.hppEyebrow}>INTERCEPTOR 使用指南</p>
            <h1>{article ? 'Capture：找到并读懂流量' : '让每一步，都有清楚的答案。'}</h1>
            <p className={styles.hppLead}>{article
              ? '从找到一条请求，到理解它的正文、时序和协议。先看清发生了什么，再决定下一步。'
              : '从第一次抓包开始，按你要完成的事情查找教程。无需阅读源码，也不需要先配置 AI。'}</p>
            <div className={styles.hppNotice}>
              <FixtureIcon iconId="i-info" svgProps={{ size: 16 }} />
              <p><strong>中文初稿</strong> · 面向 v0.1.1-alpha.1 整理。实际版本试读、真实产品截图与视频仍待补充。</p>
            </div>

            {article ? (
              <article className={styles.hppArticle}>
                <section id="preview-recording">
                  <h2>开始与暂停录制</h2>
                  <p>Capture 记录经过代理的请求。先完成代理就绪，再在外部客户端产生你有权检查的测试流量。</p>
                  <ol>
                    <li>打开 Capture，确认 Recording 已开启。</li>
                    <li>在目标客户端执行一次操作，等待新请求进入列表。</li>
                    <li>点击 Recording 暂停，再产生一条新请求。</li>
                    <li>恢复 Recording，再产生另一条新请求。</li>
                  </ol>
                  <div className={styles.hppOutcome}><strong>预期结果</strong><p>暂停前的记录仍在；暂停期间开始的新请求不补录，恢复后的新请求重新出现。</p></div>
                  <p>暂停不停止代理转发，也不恢复系统代理。已经开始的请求会继续收尾。</p>
                </section>
                <section id="preview-filters">
                  <h2>搜索和组合筛选</h2>
                  <p>在搜索框输入 Host 或 Path 的一部分，再按 Method、Status、Protocol 等分组缩小范围。</p>
                  <table><thead><tr><th>筛选方式</th><th>如何组合</th></tr></thead><tbody><tr><td>同一组的多个选项</td><td>满足任意一个</td></tr><tr><td>不同分组</td><td>同时满足</td></tr><tr><td>关键词与分组</td><td>同时满足</td></tr></tbody></table>
                  <p>清除筛选不会删除记录。不要用 Clear 来解除筛选。</p>
                </section>
                <section id="preview-body">
                  <h2>检查正文与预览范围</h2>
                  <p>JSON 可使用 Pretty、Tree、Raw、Hex；HTML、CSS、JavaScript 等内容显示为代码，不当作网页执行。</p>
                  <p>文本只读预览最多 2 MiB。需要完整保存时使用 Save body，不把复制预览当作大文件导出。</p>
                </section>
              </article>
            ) : (
              <div className={styles.hppGroups}>
                {GUIDE_PREVIEW_GROUPS.map((group) => (
                  <section className={styles.hppGroup} key={group.title}>
                    <h2>{group.title}</h2>
                    <p>{group.description}</p>
                    <div className={styles.hppGroupLinks}>
                      {group.chapters.map((chapter) => chapter === 'Capture' ? (
                        <button type="button" key={chapter} onClick={() => open('capture')}>{chapter}<FixtureIcon iconId="i-arrow" svgProps={{ size: 15 }} /></button>
                      ) : <span key={chapter}>{chapter}</span>)}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </section>

          {article && state.homepageGuideOutlinePreview ? (
            <HomepageGuideOutlinePreview
              headings={GUIDE_PREVIEW_OUTLINE}
              locale="zh"
              activeId={state.homepageGuideOutlineActive}
              onActive={setOutlineActive}
              getScrollRoot={getOutlineScrollRoot}
            />
          ) : article ? <nav className={styles.hppOnPage} aria-label="本章内容">
            <p>本章内容</p>
            <a href="#preview-recording">开始与暂停录制</a>
            <a href="#preview-filters">搜索和组合筛选</a>
            <a href="#preview-body">检查正文与预览范围</a>
          </nav> : null}
        </main>
      )}
      {state.homepageGuideSearchPreview && (
        <HomepageGuideSearchDialog
          open={state.homepageGuideSearchOpen}
          query={state.homepageGuideSearchQuery}
          locale={searchLocale}
          onQuery={(homepageGuideSearchQuery) => updateState({ homepageGuideSearchQuery })}
          onClose={() => updateState({ homepageGuideSearchOpen: false })}
          onSelect={() => updateState({ homepageGuideSearchOpen: false })}
          container={() => scrollRef.current?.closest<HTMLElement>('.app') ?? document.body}
        />
      )}
    </div>
  );
}
