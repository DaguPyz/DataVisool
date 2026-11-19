/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {useContext, useEffect, useRef} from 'react';
import type {ConfigPanelProps} from '@datavisool/sdk/host';
import type {AbstractDesignerController} from '@datavisool/sdk/core';
import type {DataConfigType} from '@datavisool/sdk/types';
import type {EditorInspectorDomain} from '@datavisool/sdk/plugin/contracts/editorInspector';
import {globalMessage} from '@datavisool/ui';
import {normalizeDataConfigAsync} from '@/util/DataSourceConfigUtil.ts';
import DataSourceConfig from '@/comps/common-component/data-source-config/DataSourceConfig.tsx';
import {isDataConfigControllerCurrent} from '@/comps/common-component/data-config/DataConfigControllerGuard.ts';
import {useEditorScene} from '@/shared/designer/EditorWorkspaceContext.ts';
import {InspectorDomainContext} from '../InspectorDomainContext.ts';

const staleTest = () => new DOMException('The editor scene is no longer active.', 'AbortError');
const testConfig = <T,>(domain: EditorInspectorDomain, id: string, kind: 'api' | 'commonApi' | 'database' | 'webSocket' | 'mqtt', config: T, isCurrent: () => boolean): T => {
    if (!isCurrent()) throw staleTest();
    const prepared = domain.prepareDataSourceTest(id, kind, config);
    if (prepared === undefined || !isCurrent()) throw staleTest();
    return prepared as T;
};

export default function DataConfigImpl(props: ConfigPanelProps) {
    const context = useContext(InspectorDomainContext);
    const scene = useEditorScene();
    const controller = props.controller as AbstractDesignerController & {isCurrent?: () => boolean};
    const activeRef = useRef(true);
    useEffect(() => {
        activeRef.current = true;
        return () => { activeRef.current = false; };
    }, []);
    const componentId = context?.target.id;
    const componentConfig = controller.getConfig() as any;
    const dataSource = (componentConfig?.data ?? {sourceType: 'static'}) as DataConfigType;
    const isReadable = () => activeRef.current && controller.isCurrent?.() === true && context?.domain.isActive() === true;
    const isCurrent = () => isReadable() && context?.canEdit() === true;
    if (!context || !componentId || !isReadable()) return null;
    const dataContext = context.domain.readDataSourceContext(componentId);
    if (!dataContext) return null;
    const variables = scene?.variables;
    const globalVariableOptions = (variables?.list() ?? []).map(item => ({label: item.key, value: item.id}));
    const readGlobalVariableValue = (id: string) => isCurrent() ? variables?.read(id)?.value : undefined;
    const changeComponentData = (data: unknown) => {
        if (isCurrent() && isDataConfigControllerCurrent(controller, componentId, {})) controller.changeData(data);
    };
    const onSave = async (config: DataConfigType, testResult?: unknown) => {
        if (!isCurrent()) return;
        const normalized = await context.trackTask(normalizeDataConfigAsync(dataSource ?? {}, config as Record<string, any>));
        if (!isCurrent() || !isDataConfigControllerCurrent(controller, componentId, {})) return;
        controller.update({data: normalized} as any, {reRender: false});
        if (normalized.sourceType === 'static') controller.changeData(testResult ?? normalized.value);
        if (!isCurrent()) return;
        globalMessage.messageApi?.success('配置项已保存');
    };

    return (
        <DataSourceConfig
            data={dataSource}
            range={dataContext.sourceTypes ? [...dataContext.sourceTypes] : undefined}
            staticDataDraftValue={dataContext.staticDataDraftValue}
            staticDataSeedKey={dataContext.staticDataSeedKey}
            globalVariableOptions={globalVariableOptions}
            readGlobalVariableValue={readGlobalVariableValue}
            onSave={onSave}
            apiTestBefore={config => testConfig(context.domain, componentId, 'api', config, isCurrent)}
            apiTestAfter={changeComponentData}
            commonApiTestBefore={config => testConfig(context.domain, componentId, 'commonApi', config, isCurrent)}
            commonApiTestAfter={changeComponentData}
            databaseTestBefore={config => testConfig(context.domain, componentId, 'database', config, isCurrent)}
            databaseTestAfter={changeComponentData}
            globalVariableTestBefore={config => config}
            globalVariableTestAfter={changeComponentData}
            wsTestBefore={config => testConfig(context.domain, componentId, 'webSocket', config, isCurrent)}
            wsTestAfter={changeComponentData}
            mqttTestBefore={config => testConfig(context.domain, componentId, 'mqtt', config, isCurrent)}
            mqttTestAfter={changeComponentData}
        />
    );
}
