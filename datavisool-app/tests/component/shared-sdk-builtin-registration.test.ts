/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {expect, it, vi} from 'vitest';

vi.hoisted(() => {
    if (!URL.createObjectURL) Object.defineProperty(URL, 'createObjectURL', {value: () => 'blob:test', configurable: true});
    if (!globalThis.Worker) Object.defineProperty(globalThis, 'Worker', {value: class {
        addEventListener() {} removeEventListener() {} postMessage() {} terminate() {}
    }, configurable: true});
});

import DesignerLoader from '@/plugins/designer-runtime/internal/designer/loader/DesignerLoader';
import DesignerRuntimeContext from '@/plugins/designer-runtime/internal/DesignerRuntimeContext.ts';
import {DesignerMode} from '@datavisool/sdk/types';

it('registers representative built-in components through the shared definition', () => {
    const runtime = new DesignerRuntimeContext();
    try {
        new DesignerLoader(DesignerMode.EDIT, runtime).scanComponents();
        for (const key of ['BaseText', 'BaseButton', 'AntdPie', 'AMap', 'MapLibreGis']) {
            expect(runtime.registry.definitions[key]?.getBaseInfo().compKey).toBe(key);
        }
    } finally {
        runtime.dispose();
    }
});

it('creates chart configs with the registered type and matching name', () => {
    const runtime = new DesignerRuntimeContext();
    try {
        new DesignerLoader(DesignerMode.EDIT, runtime).scanComponents();
        const definitions = runtime.registry.definitions;
        for (const [key, name] of [
            ['AntdGroupRose', 'Antd分组玫瑰图'],
            ['AntdWordCloud', 'Antd词云图'],
            ['AntdStepLine', '阶梯折线图'],
        ]) {
            const definition = definitions[key];
            expect(definition).toBeDefined();
            expect(definition.getInitConfig().base).toMatchObject({type: key, name});
        }
        expect(definitions.AntdBaseArea.getInitConfig().style.isPercent).toBe(false);
    } finally {
        runtime.dispose();
    }
});
