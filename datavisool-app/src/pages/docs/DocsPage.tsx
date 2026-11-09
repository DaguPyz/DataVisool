/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {useCallback, useEffect, useLayoutEffect, useState} from 'react';
import {Link, useLocation, useNavigate} from 'react-router-dom';
import {ArrowLeft, ArrowRight, Close, HamburgerButton, ListTwo, Moon, Right, Search, SunOne} from '@icon-park/react';
import {ChapterNav} from './ChapterNav';
import legacyHeadings from '../../../../docs/zh-cn/legacy-headings.json';
import logo from '@/images/datavisool-logo.webp';
import {DOC_ARTICLES, loadDocArticle, type DocArticle} from './content';
import MarkdownArticle from './article';
import {DocsDialog} from './DocsDialog';
import {DocsSearch} from './DocsSearch';
import './docs.less';

const guideHome = '/docs/zh-cn';
const themeKey = 'datavisool-docs-theme';

function savedTheme() {
    try { return localStorage.getItem(themeKey) === 'light' ? 'light' : 'dark'; }
    catch { return 'dark'; }
}

function PageToc({article, active, close}: {article: DocArticle; active: string; close?: () => void}) {
    if (!article.headings.length) return null;
    return <nav aria-label="本页目录" className="dv-docs-toc">
        <div className="dv-docs-nav-title"><ListTwo size={15}/>本页目录</div>
        {article.headings.map(heading => <Link key={heading.id} to={article.path + '#' + encodeURIComponent(heading.id)}
            data-level={heading.level} aria-current={active === heading.id ? 'location' : undefined}
            onClick={close}>{heading.text}</Link>)}
    </nav>;
}

export default function DocsPage() {
    const {pathname, hash, key: locationKey} = useLocation();
    const navigate = useNavigate();
    let path = pathname.replace(/\/+$/, '');
    try { path = decodeURI(path); } catch { /* An invalid address falls through to the missing-page view. */ }
    const collection = DOC_ARTICLES;
    const pageIndex = collection.findIndex(page => page.path === path);
    const page = collection[pageIndex];
    const [loaded, setLoaded] = useState<DocArticle>();
    const [failed, setFailed] = useState('');
    const [active, setActive] = useState('');
    const [overlay, setOverlay] = useState<'search' | 'menu' | null>(null);
    const [image, setImage] = useState<{src: string; alt: string} | null>(null);
    const openImage = useCallback((src: string, alt: string) => setImage({src, alt}), []);
    const [theme, setTheme] = useState(savedTheme);
    const article = loaded && loaded.id === page?.id ? loaded : undefined;
    const close = () => setOverlay(null);

    useEffect(() => {
        let current = true;
        setFailed('');
        if (page) loadDocArticle(page.id).then(result => {
            if (current) setLoaded(result);
        }).catch(() => { if (current) setFailed(page.id); });
        return () => { current = false; };
    }, [page]);

    useEffect(() => {
        const previous = document.title;
        document.title = (article?.title || page?.title || '未找到文档') + ' · DataVisool 文档';
        return () => { document.title = previous; };
    }, [article, page]);

    useEffect(() => {
        const viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
        const original = viewport?.content;
        if (viewport) viewport.content = 'width=device-width, initial-scale=1';
        const onKey = (event: KeyboardEvent) => {
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
                event.preventDefault();
                setImage(null);
                setOverlay('search');
            }
        };
        window.addEventListener('keydown', onKey);
        return () => {
            window.removeEventListener('keydown', onKey);
            if (viewport && original !== undefined) viewport.content = original;
        };
    }, []);

    useLayoutEffect(() => {
        if (!article) return;
        let anchor = hash.slice(1);
        try { anchor = decodeURIComponent(anchor); } catch { /* Keep the original fragment. */ }
        const aliases: Record<string, Record<string, string>> = legacyHeadings;
        const destination = aliases[article.id]?.[anchor];
        if (typeof destination === 'string' && !document.getElementById(anchor)) {
            navigate(destination.startsWith('/') ? destination : article.path + '#' + encodeURIComponent(destination), {replace: true});
            return;
        }
        const target = anchor && document.getElementById(anchor);
        if (target) target.scrollIntoView();
        else window.scrollTo(0, 0);
    }, [article, hash, locationKey, navigate]);

    useEffect(() => {
        if (!article) return;
        const headings = article.headings.map(h => document.getElementById(h.id)).filter((h): h is HTMLElement => !!h);
        const track = () => {
            let current = '';
            for (const heading of headings) {
                if (heading.getBoundingClientRect().top > 115) break;
                current = heading.id;
            }
            if (headings.length && window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2) {
                current = headings[headings.length - 1].id;
            }
            setActive(current);
        };
        track();
        window.addEventListener('scroll', track, {passive: true});
        window.addEventListener('resize', track);
        return () => {
            window.removeEventListener('scroll', track);
            window.removeEventListener('resize', track);
        };
    }, [article]);

    const toggleTheme = () => {
        const next = theme === 'dark' ? 'light' : 'dark';
        setTheme(next);
        try { localStorage.setItem(themeKey, next); } catch { /* The selection still applies for this visit. */ }
    };
    const themeLabel = theme === 'dark' ? '切换到浅色模式' : '切换到深色模式';
    const previous = collection[pageIndex - 1];
    const next = collection[pageIndex + 1];

    return <div className="dv-docs" data-theme={theme} lang="zh-CN" data-datavisool-i18n-skip="true">
        <a className="dv-docs-skip" href="#guide-content">跳到正文</a>
        <header className="dv-docs-header">
            <div className="dv-docs-header-inner">
                <Link to={guideHome} aria-label="DataVisool 文档首页" className="dv-docs-brand">
                    <img src={logo} alt=""/><span>DataVisool <strong>Docs</strong></span>
                </Link>
                <div className="dv-docs-actions">
                    <button className="dv-docs-search-trigger" aria-label="搜索文档" onClick={() => setOverlay('search')}>
                        <Search size={17}/><span>搜索文档</span><kbd>{/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘ K' : 'Ctrl K'}</kbd>
                    </button>
                    <button className="dv-docs-icon" aria-label={themeLabel} title={themeLabel} onClick={toggleTheme}>
                        {theme === 'dark' ? <SunOne size={18}/> : <Moon size={17}/>}
                    </button>
                    <Link to="/home/console" className="dv-docs-back" aria-label="返回工作台"><ArrowLeft size={16}/><span>返回工作台</span></Link>
                </div>
            </div>
        </header>
        <div className="dv-docs-layout">
            <aside className="dv-docs-sidebar">
                <ChapterNav path={path}/>
                {article && <div className="dv-docs-tablet-toc"><PageToc article={article} active={active}/></div>}
            </aside>
            <button className="dv-docs-menu-trigger" onClick={() => setOverlay('menu')}>
                <HamburgerButton size={17}/>目录<span>{page?.title}</span>
            </button>
            <div className="dv-docs-reading">
                <main id="guide-content" tabIndex={-1} className="dv-docs-main">
                    <nav aria-label="当前位置" className="dv-docs-crumbs"><Link to={guideHome}>文档</Link><Right size={12}/><span>{page?.title || '未找到文档'}</span></nav>
                    {!page ? <><h1>未找到文档</h1><p>这个地址没有对应的文章。</p><Link to={guideHome}>返回文档首页</Link></>
                        : failed === page.id ? <><h1>文档加载失败</h1><button onClick={() => window.location.reload()}>重新加载</button></>
                        : !article ? <p role="status">正在加载文档…</p>
                        : <>
                            <h1 id={article.titleId}>{article.title}</h1>
                            <MarkdownArticle article={article} onImageClick={openImage}/>
                            <nav aria-label="翻页" className="dv-docs-pager">
                                {previous && <Link to={previous.path} rel="prev"><ArrowLeft size={18}/>
                                    <span><small>上一篇</small><strong>{previous.title}</strong></span></Link>}
                                {next && <Link to={next.path} rel="next">
                                    <span><small>下一篇</small><strong>{next.title}</strong></span><ArrowRight size={18}/></Link>}
                            </nav>
                        </>}
                </main>
                {article && <aside className="dv-docs-page-nav"><PageToc article={article} active={active}/></aside>}
            </div>
        </div>
        {overlay === 'search' && <DocsSearch onClose={close}/>}
        {overlay === 'menu' && <DocsDialog label="阅读目录" kind="menu" onClose={close}>
            <div className="dv-docs-dialog-head">阅读目录<button className="dv-docs-icon" aria-label="关闭目录" onClick={close}><Close size={17}/></button></div>
            <ChapterNav path={path} close={close}/>{article && <PageToc article={article} active={active} close={close}/>}
        </DocsDialog>}
        {image && <DocsDialog label={image.alt || '截图预览'} kind="image" onClose={() => setImage(null)}>
            <div className="dv-docs-image-head"><span>{image.alt}</span><button className="dv-docs-icon" aria-label="关闭图片" onClick={() => setImage(null)}><Close size={18}/></button></div>
            <img src={image.src} alt={image.alt}/>
        </DocsDialog>}
    </div>;
}
