/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {useEffect} from 'react';
import {useLocation, useNavigate} from 'react-router-dom';
import navigation from '../../../../docs/zh-cn/navigation.json';

const home = '/docs/zh-cn';

type ArticleRoute = {id: string; path: string; sourcePath?: string};

function normalizeLegacyId(id: string): string {
    return id.replace(/^\/+|\/+$/g, '').replace(/\.md$/i, '');
}

function legacyDestination(pathname: string, search: string, hash: string): string | null {
    const rawHash = hash.startsWith('#') ? hash.slice(1) : hash;
    const hasHashRoute = rawHash.startsWith('/');
    const queryIndex = rawHash.indexOf('?');
    const hashPath = hasHashRoute ? rawHash.slice(1, queryIndex < 0 ? undefined : queryIndex) : '';
    const hashQuery = queryIndex < 0 ? '' : rawHash.slice(queryIndex + 1);
    const pathFromUrl = pathname.startsWith('/docs/') ? pathname.slice('/docs/'.length) : '';
    let oldId = normalizeLegacyId(hasHashRoute ? hashPath : pathFromUrl).replace(/^archive\/?/, '');
    try { oldId = decodeURIComponent(oldId); } catch { /* Use the literal route if the old URL is malformed. */ }
    const params = new URLSearchParams(hashQuery || search);
    const heading = params.get('id');
    if (!oldId || oldId === 'index') return home + (heading ? '#' + encodeURIComponent(heading) : '');

    const target = (navigation.articles as ArticleRoute[])
        .find(article => article.id === oldId || normalizeLegacyId(article.sourcePath ?? '') === oldId);
    const aliases = navigation.legacyAliases as Record<string, string>;
    const hasAlias = Object.prototype.hasOwnProperty.call(aliases, oldId);
    const mapped = target?.path ?? (hasAlias ? aliases[oldId] : undefined);
    if (!mapped || !mapped.startsWith('/docs/zh-cn')) return home;
    return mapped + (heading && !hasAlias ? '#' + encodeURIComponent(heading) : '');
}

export default function LegacyDocsRedirect() {
    const {pathname, search, hash} = useLocation();
    const navigate = useNavigate();
    const legacyHash = new URLSearchParams(search).get('legacy');
    const destination = legacyDestination(pathname, legacyHash ? '' : search, legacyHash ?? hash);

    useEffect(() => {
        navigate(destination ?? home, {replace: true});
    }, [destination, navigate]);

    return <main role="status" aria-live="polite" style={{padding: '2rem'}}>正在打开文档…</main>;
}
