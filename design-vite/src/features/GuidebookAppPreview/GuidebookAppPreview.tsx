import { FixtureIcon } from '../../fixtures/FixtureIcon';
import { useDesignState } from '../../state/useDesignState';
import styles from './GuidebookAppPreview.module.css';

const CHAPTERS = [
  '快速上手',
  '工作区与基本操作',
  'Capture',
  'Composer',
  'Rules',
  'Breakpoints',
  '导入导出',
  'Settings',
  'Diagnostics',
  'Agent',
  'MCP',
] as const;

export function GuidebookAppPreview(): React.JSX.Element {
  const { state, updateState } = useDesignState();
  const loading = state.guidebookAppState === 'loading';
  const error = state.guidebookAppState === 'error';

  return (
    <section className={`${styles.gbAppRoot} mv`} data-v="guidebook" data-state={state.guidebookAppState}>
      <header className={styles.gbAppToolbar}>
        <div className={styles.gbAppNavigation}>
          <button type="button" aria-label="后退"><FixtureIcon iconId="i-arrow-left" svgProps={{}} /></button>
          <button type="button" aria-label="前进" disabled><FixtureIcon iconId="i-arrow" svgProps={{}} /></button>
          <button type="button" aria-label="重新加载" onClick={() => updateState({ guidebookAppState: 'loading' })}><FixtureIcon iconId="i-refresh" svgProps={{}} /></button>
        </div>
        <div className={styles.gbAppAddress}>
          <FixtureIcon iconId="i-book-open" svgProps={{}} />
          <span>使用指南</span>
          <small>www.interceptor.cn/guide/capture</small>
        </div>
        <div className={styles.gbAppActions}>
          <span className={styles.gbAppOnline}><i />在线</span>
          <button type="button" onClick={() => updateState({ guidebookAppSearchOpen: true })}><FixtureIcon iconId="i-search" svgProps={{}} />搜索</button>
          <button type="button"><FixtureIcon iconId="i-external" svgProps={{}} />浏览器打开</button>
        </div>
      </header>

      {loading ? (
        <div className={styles.gbAppCentered}>
          <span className={styles.gbAppSpinner} />
          <strong>正在加载使用指南</strong>
          <p>连接 interceptor.cn 并恢复上次阅读位置…</p>
        </div>
      ) : error ? (
        <div className={styles.gbAppCentered}>
          <FixtureIcon iconId="i-wifi-off" svgProps={{}} />
          <strong>无法加载使用指南</strong>
          <p>检查网络后重试，或在浏览器中打开在线版本。</p>
          <div>
            <button type="button" onClick={() => updateState({ guidebookAppState: 'ready' })}>重试</button>
            <button type="button">浏览器打开</button>
          </div>
        </div>
      ) : (
        <div className={styles.gbAppReading}>
          <aside className={styles.gbAppChapters}>
            <div className={styles.gbAppChapterHeader}>
              <strong>使用指南</strong>
              <small>中文 · 在线</small>
            </div>
            <button type="button" className={styles.gbAppSearchButton} onClick={() => updateState({ guidebookAppSearchOpen: true })}>
              <FixtureIcon iconId="i-search" svgProps={{}} />搜索全部章节 <kbd>Ctrl K</kbd>
            </button>
            {CHAPTERS.map((chapter, index) => (
              <button key={chapter} type="button" data-active={chapter === 'Capture'}>
                <span>{String(index + 1).padStart(2, '0')}</span>{chapter}
              </button>
            ))}
          </aside>

          <article className={styles.gbAppArticle}>
            <p className={styles.gbAppEyebrow}>INTERCEPTOR 使用指南</p>
            <h1>Capture：找到并读懂流量</h1>
            <p className={styles.gbAppLead}>从找到一条请求，到理解它的正文、时序和协议。先看清发生了什么，再决定下一步。</p>
            <div className={styles.gbAppNotice}><FixtureIcon iconId="i-info" svgProps={{}} />页面内容来自在线 Guidebook；App 不会把 Preload 或业务 IPC 暴露给远程页面。</div>
            <section>
              <h2>搜索和组合筛选</h2>
              <p>先使用搜索词缩小范围，再按 Application、Method、Host、Status 或 Protocol 组合筛选。</p>
              <ol>
                <li>在搜索框输入目标路径或 Host。</li>
                <li>展开筛选分组并选择需要的值。</li>
                <li>检查当前结果数量，再打开目标请求。</li>
              </ol>
              <button className={styles.gbAppMedia} type="button" onClick={() => updateState({ guidebookAppImageOpen: true })}>
                <span><FixtureIcon iconId="i-image" svgProps={{}} /></span>
                <strong>查看真实 App 步骤图</strong>
                <small>Capture 筛选 · 2400 × 1350</small>
              </button>
            </section>
            <section>
              <h2>检查请求详情</h2>
              <p>在 Headers、Request、Response、Timing、Cookie 与 TLS 之间切换，保留当前阅读位置。</p>
            </section>
          </article>

          <aside className={styles.gbAppOutline}>
            <strong>本章内容</strong>
            <a href="#search" data-current="true">搜索和组合筛选</a>
            <a href="#details">检查请求详情</a>
            <a href="#body">正文与格式</a>
            <a href="#messages">WebSocket 与 gRPC</a>
          </aside>
        </div>
      )}

      <footer className={styles.gbAppStatus}>
        <span><i />在线 Guidebook</span>
        <span>上次更新：刚刚</span>
        <span>阅读位置已保留</span>
      </footer>

      {state.guidebookAppSearchOpen && (
        <div className={styles.gbAppOverlay} role="presentation" onMouseDown={() => updateState({ guidebookAppSearchOpen: false })}>
          <div className={styles.gbAppSearchDialog} role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <header><FixtureIcon iconId="i-search" svgProps={{}} /><input value="证书" readOnly autoFocus /><kbd>Esc</kbd></header>
            <p>7 个结果</p>
            <button type="button"><strong>准备 CA 和 HTTPS 解密</strong><span>Settings · 证书与信任</span></button>
            <button type="button"><strong>查看、移除信任与删除 CA</strong><span>Settings · Certificate lifecycle</span></button>
            <button type="button"><strong>TLS 透传不会安装证书</strong><span>Settings · TLS passthrough</span></button>
          </div>
        </div>
      )}

      {state.guidebookAppImageOpen && (
        <div className={styles.gbAppOverlay} role="presentation" onMouseDown={() => updateState({ guidebookAppImageOpen: false })}>
          <div className={styles.gbAppImageDialog} role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <header><strong>Capture 筛选</strong><button type="button" onClick={() => updateState({ guidebookAppImageOpen: false })}><FixtureIcon iconId="i-x" svgProps={{}} /></button></header>
            <div><FixtureIcon iconId="i-image" svgProps={{}} /><span>真实 App 步骤图预览</span></div>
            <footer>100% · 可缩放与拖动</footer>
          </div>
        </div>
      )}
    </section>
  );
}
