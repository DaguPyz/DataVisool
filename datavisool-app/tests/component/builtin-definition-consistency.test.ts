/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {expect, it, vi} from 'vitest';

vi.hoisted(() => {
    if (!URL.createObjectURL) Object.defineProperty(URL, 'createObjectURL', {value: () => 'blob:test', configurable: true});
    if (!globalThis.Worker) Object.defineProperty(globalThis, 'Worker', {value: class {
        addEventListener() {} removeEventListener() {} postMessage() {} terminate() {}
    }, configurable: true});
});

import DesignerLoader from '@/plugins/designer-runtime/internal/designer/loader/DesignerLoader';
import AbstractDesignerDefinition from '@/framework/core/AbstractDesignerDefinition';
import DesignerRuntimeContext from '@/plugins/designer-runtime/internal/DesignerRuntimeContext.ts';
import {DesignerMode} from '@datavisool/sdk/types';

it('registers each built-in definition under its own default component type', () => {
    const runtime = new DesignerRuntimeContext();
    try {
        new DesignerLoader(DesignerMode.EDIT, runtime).scanComponents();
        const definitions = Object.entries(runtime.registry.definitions);
        expect(definitions.length).toBeGreaterThan(40);
        const modules = {
            ...import.meta.glob('/src/comps/**/*.ts', {eager: true}),
            ...import.meta.glob('/src/plugins/designer-runtime/internal/builtin/**/*.ts', {eager: true}),
        } as Record<string, {default?: any}>;
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
        runtime.dispose();
    }
});
