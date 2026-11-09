/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {afterEach, expect, test, vi} from 'vitest';

const catalog = vi.hoisted(() => ({components: [] as any[]}));
vi.mock('@/frontend-effect/tools/GetComponentCatalogTool.ts', () => ({getLoadedComponentCatalogEntries: () => catalog.components}));
import {runGetComponentDataContractTool} from '@/frontend-effect/tools/GetComponentDataContractTool.ts';

afterEach(() => {delete (window as any).DATAVISOOL_ENV; catalog.components = [];});

test('returns the actual loaded document identity with current data and mappings', () => {
    const identity = {componentType: 'AntdBaseColumn', source: 'remote', componentId: '42', componentVersion: 'code-v1', sha256: 'hash', documentFormatVersion: 'component-document/v1'};
    catalog.components = [{componentType: 'AntdBaseColumn', documentInfo: {...identity, componentInfo: {description: 'summary'}}}];
    (window as any).DATAVISOOL_ENV = {currentManager: {layerManager: {
        layerConfigs: {chart: {type: 'AntdBaseColumn'}},
        controllers: {chart: {getConfig: () => ({base: {type: 'AntdBaseColumn'}, style: {xField: 'category', yField: 'amount'},
            data: {sourceType: 'static', staticData: {value: [{category: 'A', amount: 10}]}, value: [{category: 'A', amount: 10}]}})}},
    }}};
    const result = runGetComponentDataContractTool({componentIds: ['chart'], sourceType: 'static'});
    expect(result.sourceContract.branch).toBe('staticData');
    expect(result.components[0].documentIdentity).toEqual(identity);
    expect(result.components[0].fieldMapping).toEqual({xField: 'category', yField: 'amount'});
    expect(result.components[0].currentData).toMatchObject({valueExample: [{category: 'A', amount: 10}]});
    expect(result.components[0]).not.toHaveProperty('dataFormatRequirements');
});

test('reports missing components and refuses to invent a document identity', () => {
    expect(runGetComponentDataContractTool({componentIds: ['missing']}).missingComponentIds).toEqual(['missing']);
    (window as any).DATAVISOOL_ENV = {currentManager: {layerManager: {layerConfigs: {existing: {type: 'Unknown'}}, controllers: {}}}};
    expect(() => runGetComponentDataContractTool({componentIds: ['existing']})).toThrow('组件没有可用文档');
});
