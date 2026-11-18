/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {useState} from 'react';
import {BookOpen, Down, Right} from '@icon-park/react';
import type {RouterService} from '@/contracts/router.ts';
import {DOC_ARTICLES, type DocArticleMeta} from './content';

interface Branch extends DocArticleMeta {
    children: Branch[];
}

function chapterTree(chapters: readonly DocArticleMeta[]): Branch[] {
    const roots: Branch[] = [];
    const parents: Branch[] = [];
    for (const chapter of chapters) {
        const branch: Branch = {...chapter, children: []};
        const parent = parents[chapter.depth - 1];
        (parent?.children ?? roots).push(branch);
        parents[chapter.depth] = branch;
        parents.length = chapter.depth + 1;
    }
    return roots;
}

const guide = chapterTree(DOC_ARTICLES);

function containsPath(branch: Branch, path: string): boolean {
    return branch.path === path || branch.children.some(child => containsPath(child, path));
}

function ChapterList({branches, path, close, Link}: {
    branches: Branch[]; path: string; close?: () => void; Link: RouterService['Link'];
}) {
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});
    return <ul>{branches.map(branch => {
        const hasChildren = !!branch.children.length;
        const open = expanded[branch.id] ?? containsPath(branch, path);
        return <li key={branch.id}>
            <div className="dv-docs-chapter-row">
                <Link to={branch.path} onClick={close}
                      aria-current={branch.path === path ? 'page' : undefined}>{branch.title}</Link>
                {hasChildren && <button type="button" aria-label={(open ? '收起' : '展开') + branch.title}
                    aria-expanded={open} onClick={() => setExpanded(previous => ({...previous, [branch.id]: !open}))}>
                    {open ? <Down size={12}/> : <Right size={12}/>}
                </button>}
            </div>
            {hasChildren && open && <ChapterList branches={branch.children} path={path} close={close} Link={Link}/>}
        </li>;
    })}</ul>;
}

export function ChapterNav({path, close, Link}: {path: string; close?: () => void; Link: RouterService['Link']}) {
    return <nav aria-label="文档目录" className="dv-docs-chapters">
        <div className="dv-docs-nav-title"><BookOpen size={16}/>使用指南</div>
        <ChapterList branches={guide} path={path} close={close} Link={Link} key={path}/>
    </nav>;
}
