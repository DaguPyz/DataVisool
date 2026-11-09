/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import loaders from 'virtual:user-guide/catalog';
import navigation from '../../../../docs/zh-cn/navigation.json';

export interface DocHeading {
    id: string;
    text: string;
    level: number;
    line: number;
}

export interface DocArticleMeta {
    id: string;
    title: string;
    path: string;
    sourcePath?: string;
}

export interface DocArticle extends DocArticleMeta {
    links: Record<string, string>;
    images: Record<string, string>;
    titleLine: number;
    titleId: string;
    headings: DocHeading[];
    markdown: string;
}

export interface DocSearchResult {
    id: string;
    title: string;
    path: string;
    snippet: string;
    headingText?: string;
    headingId?: string;
}

export const DOC_ARTICLES: ReadonlyArray<DocArticleMeta> = navigation.articles;

interface SearchSection {
    headingText?: string;
    headingId?: string;
    text: string;
}

export interface SearchEntry {
    id: string;
    title: string;
    navTitle: string;
    path: string;
    sections: SearchSection[];
}

export function loadDocArticle(id: string): Promise<DocArticle> {
    return loaders[id]();
}

export async function searchDocArticles(query: string): Promise<DocSearchResult[]> {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) {
        return [];
    }

    const {default: articles} = await import('virtual:user-guide/search-index');
    const terms = normalizedQuery.split(/\s+/).filter(Boolean);
    const results: Array<DocSearchResult & {score: number}> = [];

    for (const article of articles) {
        const title = article.title.toLocaleLowerCase();
        const navTitle = article.navTitle.toLocaleLowerCase();
        const titleMatches = terms.every(term => title.includes(term) || navTitle.includes(term));
        let bestSection: SearchSection | undefined;
        let bestScore = titleMatches ? (title === normalizedQuery ? 100 : 70) : 0;

        for (const section of article.sections) {
            const heading = section.headingText?.toLocaleLowerCase() ?? "";
            const text = section.text.toLocaleLowerCase();
            const sectionMatches = terms.every(term => heading.includes(term) || text.includes(term));
            if (!sectionMatches) {
                continue;
            }

            const score = (heading && terms.every(term => heading.includes(term)) ? 45 : 0)
                + (text && terms.every(term => text.includes(term)) ? 25 : 0)
                + (section.headingId ? 1 : 0);
            if (score > bestScore) {
                bestSection = section;
                bestScore = score;
            }
        }

        if (bestScore === 0) {
            continue;
        }

        results.push({
            id: article.id,
            title: article.title,
            path: article.path,
            snippet: bestSection ? makeSnippet(bestSection.text, terms) : article.sections.find(section => section.text)?.text.slice(0, 96) || '',
            headingText: bestSection?.headingText,
            headingId: bestSection?.headingId,
            score: bestScore,
        });
    }

    return results
        .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title, "zh-CN"))
        .slice(0, 12)
        .map(({score: _score, ...result}) => result);
}

function makeSnippet(text: string, terms: string[]): string {
    const cleanText = text.replace(/\s+/g, " ").trim();
    const lowerText = cleanText.toLocaleLowerCase();
    const matchPositions = terms.map(term => lowerText.indexOf(term)).filter(position => position >= 0);
    const firstMatch = matchPositions.length ? Math.min(...matchPositions) : 0;
    const start = Math.max(0, firstMatch - 38);
    const end = Math.min(cleanText.length, start + 100);
    return `${start > 0 ? "…" : ""}${cleanText.slice(start, end)}${end < cleanText.length ? "…" : ""}`;
}
