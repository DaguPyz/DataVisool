/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import type {ReactNode} from 'react';
import {Navigate, useLocation, useMatches, useOutlet, useParams, type RouteObject} from 'react-router-dom';
import type {RouteDefinition, RouteLocation, RouteRenderContext} from '@datavisool/sdk/plugin/contracts/router';

interface RouteEntry {
    readonly definition: RouteDefinition;
    readonly children: RouteEntry[];
}

export function createLocationSnapshot(
    {key, pathname, search, hash}: Omit<RouteLocation, 'matchedRouteIds'>, matchedRouteIds: string[],
): RouteLocation {
    return Object.freeze({key, pathname, search, hash, matchedRouteIds: Object.freeze(matchedRouteIds)});
}

function createRouteElement(render: (context: RouteRenderContext) => ReactNode) {
    function RouteView() {
        const location = useLocation();
        const matches = useMatches();
        const params = Object.freeze({...useParams()});
        const outlet = useOutlet();
        return <>{render({location: createLocationSnapshot(location, matches.map(match => match.id)), params, outlet})}</>;
    }
    return <RouteView/>;
}

function validatePath(route: RouteDefinition) {
    const {path, parentId, id} = route;
    if (route.index) {
        if (!parentId || path !== undefined) throw new Error(`Index route '${id}' requires a parent and omits the path.`);
        return;
    }
    if (typeof path !== 'string') throw new Error(`Route '${id}' requires a path.`);
    const absolute = path.startsWith('/');
    if (!path || path.trim() !== path || path.startsWith('//') || absolute !== (parentId === undefined)) {
        throw new Error(`Invalid path '${path}' for route '${id}'. Use absolute root paths and relative child paths.`);
    }
}

export function buildRouteTree(definitions: readonly RouteDefinition[], errorElement: ReactNode) {
    const entries = new Map<string, RouteEntry>();
    for (const definition of definitions) {
        if (typeof definition.id !== 'string' || !definition.id.trim()) throw new Error('Route ID must be a non-empty string.');
        if (entries.has(definition.id)) throw new Error(`Duplicate route ID '${definition.id}'.`);
        validatePath(definition);
        entries.set(definition.id, {definition, children: []});
    }

    const roots: RouteEntry[] = [];
    for (const entry of entries.values()) {
        const {id, parentId} = entry.definition;
        if (parentId === undefined) {
            roots.push(entry);
            continue;
        }
        const parent = entries.get(parentId);
        if (!parent) throw new Error(`Route '${id}' is missing parent route '${parentId}'.`);
        if (parent.definition.index || parent.definition.redirectTo !== undefined) {
            throw new Error(`Parent route '${parentId}' cannot render child route '${id}'.`);
        }
        parent.children.push(entry);
    }

    const paths = new Map<string, string>();
    const patterns = new Map<string, string>();
    const visiting = new Set<string>();
    function resolvePath(entry: RouteEntry): string {
        const {id, index, parentId, path} = entry.definition;
        const existing = paths.get(id);
        if (existing !== undefined) return existing;
        if (visiting.has(id)) throw new Error(`Route '${id}' is in a parent cycle.`);
        visiting.add(id);
        const parentPath = parentId === undefined ? '' : resolvePath(entries.get(parentId)!);
        const fullPath = (parentPath + '/' + (path ?? '')).replace(/\/+/g, '/').replace(/\/$/, '') || '/';
        // Parameter names do not distinguish URLs. An index intentionally shares its parent's URL.
        const pattern = (index ? 'index:' : '') + fullPath.toLowerCase().replace(/\/:[\w-]+/g, '/:param');
        const conflict = patterns.get(pattern);
        if (conflict !== undefined) {
            throw new Error(`Conflicting path '${fullPath}' for routes '${conflict}' and '${id}'.`);
        }
        patterns.set(pattern, id);
        paths.set(id, fullPath);
        visiting.delete(id);
        return fullPath;
    }
    for (const entry of entries.values()) resolvePath(entry);

    function toRouteObject({definition, children}: RouteEntry): RouteObject {
        const {id, render, redirectTo} = definition;
        const element = redirectTo === undefined ? createRouteElement(render) : <Navigate to={redirectTo} replace/>;
        if (definition.index) return {id, index: true, element, errorElement};
        return {id, path: definition.path, element, errorElement, children: children.map(toRouteObject)};
    }

    return {routes: roots.map(toRouteObject), paths};
}
