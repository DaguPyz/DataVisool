/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {useEffect, useState} from 'react';
import {Link, useNavigate} from 'react-router-dom';
import {Close, FileText, Search} from '@icon-park/react';
import {DOC_ARTICLES, searchDocArticles} from './content';
import {DocsDialog} from './DocsDialog';

export function DocsSearch({onClose}: {onClose: () => void}) {
    const [query, setQuery] = useState('');
    const [hits, setHits] = useState<Awaited<ReturnType<typeof searchDocArticles>>>([]);
    const [status, setStatus] = useState<'ready' | 'loading' | 'error'>('ready');
    const navigate = useNavigate();
    const term = query.trim();

    useEffect(() => {
        let current = true;
        if (term) {
            setStatus('loading');
            searchDocArticles(term).then(results => {
                if (current) {
                    setHits(results);
                    setStatus('ready');
                }
            }).catch(() => { if (current) setStatus('error'); });
        }
        return () => { current = false; };
    }, [term]);

    const items = term ? hits.map(hit => ({
        path: hit.path + (hit.headingId ? '#' + encodeURIComponent(hit.headingId) : ''),
        label: hit.headingText || hit.title,
        context: hit.headingText ? hit.title : '',
        snippet: hit.snippet,
    })) : DOC_ARTICLES.map(page => ({path: page.path, label: page.title, context: '', snippet: ''}));
    const ready = !term || status === 'ready';

    return <DocsDialog kind="search" label="搜索文档" onClose={onClose}>
        <div className="dv-docs-search-field">
            <Search size={20}/>
            <input type="search" aria-label="搜索文档" placeholder="搜索标题或正文…" value={query}
                   autoFocus onChange={event => setQuery(event.target.value)}
                   onKeyDown={event => {
                       if (event.key === 'Enter' && ready && items.length) {
                           event.preventDefault();
                           navigate(items[0].path);
                           onClose();
                       } else if (event.key === 'ArrowDown') {
                           event.preventDefault();
                           event.currentTarget.closest('dialog')?.querySelector<HTMLAnchorElement>('.dv-docs-hit')?.focus();
                       }
                   }}/>
            <button className="dv-docs-icon" aria-label="关闭搜索" onClick={onClose}><Close size={16}/></button>
        </div>
        <div className="dv-docs-search-results">
            <p className="dv-docs-nav-title" role="status">
                {!term ? '文档目录' : status === 'loading' ? '搜索中…' : status === 'error' ? '搜索暂不可用，请重新输入关键词。'
                    : items.length ? `找到 ${items.length} 个结果` : '没有找到相关内容，试试其他关键词。'}
            </p>
            {ready && items.map(item => <Link key={item.path} to={item.path} onClick={onClose} className="dv-docs-hit"
                onKeyDown={event => {
                    const next = event.key === 'ArrowDown' ? event.currentTarget.nextElementSibling
                        : event.key === 'ArrowUp' ? event.currentTarget.previousElementSibling : null;
                    if (next instanceof HTMLAnchorElement) {
                        event.preventDefault();
                        next.focus();
                    } else if (event.key === 'ArrowUp') {
                        event.preventDefault();
                        event.currentTarget.closest('dialog')?.querySelector('input')?.focus();
                    }
                }}>
                <FileText size={16}/><span><strong>{item.label}</strong>
                    {item.context && <small>{item.context}</small>}{item.snippet && <span>{item.snippet}</span>}
                </span>
            </Link>)}
        </div>
    </DocsDialog>;
}
