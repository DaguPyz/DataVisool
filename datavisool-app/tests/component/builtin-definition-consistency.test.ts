/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {expect, it, vi} from 'vitest';

vi.hoisted(() => {
    if (!URL.createObjectURL) Object.defineProperty(URL, 'createObjectURL', {value: () => 'blob:test', configurable: true});
    if (!globalThis.Worker) Object.defineProperty(globalThis, 'Worker', {value: class {
        addEventListener() {} removeEventListener() {} postMessage() {} terminate() {}
    }, configurable: true});
});

import DesignerLoader from '@/designer/loader/DesignerLoader';
import AbstractDesignerDefinition from '@/framework/core/AbstractDesignerDefinition';
import {componentCategorize} from '@/designer/left/compoent-lib/ComponentCategorize';

it('registers each built-in definition under its own default component type', () => {
    const originalDefinitions = DesignerLoader.definitionMap;
    const originalCategories = [...componentCategorize];
    try {
        DesignerLoader.definitionMap = {};
        new DesignerLoader().scanComponents();
        const definitions = Object.entries(DesignerLoader.definitionMap);
        expect(definitions.length).toBeGreaterThan(40);
        const modules = import.meta.glob('/src/comps/**/*.ts', {eager: true}) as Record<string, {default?: any}>;
        const sourcesByType = new Map<string, string[]>();
        for (const [path, module] of Object.entries(modules)) {
            const Definition = module.default;
            if (!Definition || !AbstractDesignerDefinition.isPrototypeOf(Definition)) continue;
            const definition = new Definition();
            const type = typeof definition.getBaseInfo === "function" ? definition.getBaseInfo()?.compKey : undefined;
            if (type) sourcesByType.set(type, [...(sourcesByType.get(type) ?? []), path]);
        }
        expect([...sourcesByType].filter(([, paths]) => paths.length > 1)).toEqual([]);
        expect([...sourcesByType.keys()].sort()).toEqual(definitions.map(([key]) => key).sort());
        const mismatches = definitions.flatMap(([key, definition]) => {
            const baseInfo = definition.getBaseInfo();
            const config = definition.getInitConfig();
            return baseInfo.compKey !== key || config?.base?.type !== key
                ? [{key, registered: baseInfo.compKey, defaultType: config?.base?.type}]
                : [];
        });
        expect(mismatches).toEqual([]);
    } finally {
        DesignerLoader.definitionMap = originalDefinitions;
        componentCategorize.splice(0, componentCategorize.length, ...originalCategories);
    }
});
