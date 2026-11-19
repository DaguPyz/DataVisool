/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import type {EditorInspectorDomain, EditorInspectorTarget} from '@datavisool/sdk/plugin/contracts/editorInspector';
import type {ILayerItem} from '@datavisool/sdk/types';

export function createInspectorTarget(id: string, type = 'rect', name = id): EditorInspectorTarget {
    return {
        id,
        type,
        layer: {id, type, name, x: 0, y: 0, width: 100, height: 100} as ILayerItem,
        componentInfo: {id, compName: name, type, version: '1.0'},
        menus: [{icon: (() => null) as never, name: '样式', key: 'style'}],
        configPanels: {},
        initialConfig: {},
    };
}

export function createInspectorTestDomain(targets: readonly EditorInspectorTarget[]) {
    const byId = new Map(targets.map(target => [target.id, target]));
    let active = true;
    const domain: EditorInspectorDomain = {
        sceneIdentity: Object.freeze({}),
        sceneVersion: 1,
        isActive: () => active,
        readTarget: id => byId.get(id),
        createControllerFacade: () => undefined,
        readStatuses: () => ({items: []}),
        applyStatusChange: () => true,
        applyLayerEdit: () => true,
        resetConfig: () => true,
        readDataSourceContext: id => ({staticDataSeedKey: id}),
        prepareDataSourceTest: (_id, _kind, config) => config,
        applyTheme: () => true,
        applyFilter: () => true,
    };
    return {domain, deactivate: () => { active = false; }};
}
