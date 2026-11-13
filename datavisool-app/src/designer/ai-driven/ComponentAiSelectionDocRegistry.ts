/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import index from "./generated/component-document-index.json";

export interface IAiDrivenComponentInfo {
    componentType: string;
    componentName: string;
    description: string;
    nativeCapabilities: string;
    selectable: boolean;
}
export interface ComponentDocumentInfo {
    componentType: string;
    componentId?: string;
    source: string;
    componentVersion: string;
    corpusVersion?: string;
    sha256: string;
    documentFormatVersion: string;
    hasFullSpec: boolean;
    componentInfo: IAiDrivenComponentInfo;
}

/** 构建生成的轻量元数据；浏览器不导入组件文档正文。 */
export const componentDocumentIndex = index as {corpusVersion: string; documents: ComponentDocumentInfo[]};
export const getAiDrivenComponentSelectionInfoRegistrySnapshot = (): IAiDrivenComponentInfo[] =>
    componentDocumentIndex.documents.map(doc => doc.componentInfo);
