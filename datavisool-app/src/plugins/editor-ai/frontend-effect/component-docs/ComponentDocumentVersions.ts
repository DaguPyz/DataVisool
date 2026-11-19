/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {getLoadedComponentCatalogEntries} from '../tools/GetComponentCatalogTool.ts';
import {FrontendEffectClientError} from '../FrontendEffectClientError.ts';
import type {DesignerCatalog} from '@datavisool/sdk/plugin/contracts/designerCatalog';

/** 数据说明书回执携带实际加载组件的文档身份，由后端校验并补充专属数据要求。 */
export function getLoadedComponentDocumentIdentity(componentType: string, designerCatalog: DesignerCatalog): Record<string, unknown> {
    const current = getLoadedComponentCatalogEntries(designerCatalog).find(item => item.componentType === componentType)?.documentInfo;
    if (!current) throw new FrontendEffectClientError('agent.component_specs.component_unavailable', `组件没有可用文档：${componentType}`, {
        fieldPath: 'componentType', actualValue: componentType,
        allowedValues: getLoadedComponentCatalogEntries(designerCatalog).map(item => item.componentType),
    });
    return Object.fromEntries(['source', 'componentType', 'componentId', 'componentVersion', 'corpusVersion', 'sha256', 'documentFormatVersion']
        .filter(key => current[key as keyof typeof current] !== undefined)
        .map(key => [key, current[key as keyof typeof current]]));
}

/** 服务端提供配置校验使用的文档身份，浏览器检查其版本与实际加载代码一致。 */
export function assertComponentDocumentVersions(request: Record<string, unknown>, designerCatalog: DesignerCatalog) {
    if (!Array.isArray(request.componentDocumentIdentities)) return;
    const loaded = new Map(getLoadedComponentCatalogEntries(designerCatalog).map(item => [item.componentType, item.documentInfo]));
    for (const identity of request.componentDocumentIdentities as Array<Record<string, any>>) {
        const current = loaded.get(identity.componentType);
        if (!current || current.source !== identity.source || current.componentId !== identity.componentId
            || current.componentVersion !== identity.componentVersion || current.sha256 !== identity.sha256
            || current.corpusVersion !== identity.corpusVersion)
            throw new FrontendEffectClientError('agent.component_specs.version_mismatch', `组件代码与配置校验文档版本不同，请确认组件版本：${identity.componentType}`, {
                fieldPath: `componentDocumentIdentities.${identity.componentType}`,
                actualValue: current ?? null,
                expectedValue: identity,
            });
    }
}
