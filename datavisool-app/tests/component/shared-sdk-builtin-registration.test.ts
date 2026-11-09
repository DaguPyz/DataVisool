/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {expect, it, vi} from 'vitest';

vi.hoisted(() => {
    if (!URL.createObjectURL) Object.defineProperty(URL, 'createObjectURL', {value: () => 'blob:test', configurable: true});
    if (!globalThis.Worker) Object.defineProperty(globalThis, 'Worker', {value: class {
        addEventListener() {} removeEventListener() {} postMessage() {} terminate() {}
    }, configurable: true});
});

import DesignerLoader from '@/designer/loader/DesignerLoader';
import {componentCategorize} from '@/designer/left/compoent-lib/ComponentCategorize';

it('registers representative built-in components through the shared definition', () => {
    const originalDefinitions = DesignerLoader.definitionMap;
    const originalCategories = [...componentCategorize];
    try {
        DesignerLoader.definitionMap = {};
        new DesignerLoader().scanComponents();
        for (const key of ['BaseText', 'BaseButton', 'AntdPie', 'AMap', 'MapLibreGis']) {
            expect(DesignerLoader.definitionMap[key]?.getBaseInfo().compKey).toBe(key);
        }
    } finally {
        DesignerLoader.definitionMap = originalDefinitions;
        componentCategorize.splice(0, componentCategorize.length, ...originalCategories);
    }
});

it('creates chart configs with the registered type and matching name', () => {
    const originalDefinitions = DesignerLoader.definitionMap;
    const originalCategories = [...componentCategorize];
    try {
        DesignerLoader.definitionMap = {};
        new DesignerLoader().scanComponents();
        for (const [key, name] of [
            ['AntdGroupRose', 'Antd分组玫瑰图'],
            ['AntdWordCloud', 'Antd词云图'],
            ['AntdStepLine', '阶梯折线图'],
        ]) {
            const definition = DesignerLoader.definitionMap[key];
            expect(definition).toBeDefined();
            expect(definition.getInitConfig().base).toMatchObject({type: key, name});
        }
        expect(DesignerLoader.definitionMap.AntdBaseArea.getInitConfig().style.isPercent).toBe(false);
    } finally {
        DesignerLoader.definitionMap = originalDefinitions;
        componentCategorize.splice(0, componentCategorize.length, ...originalCategories);
    }
});
