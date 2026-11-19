/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

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

