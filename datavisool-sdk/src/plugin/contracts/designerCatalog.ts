/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import type {BaseInfoType} from '../../types.js';
import type {ICategorize} from '../../core/ComponentTypes.js';

export type DesignerCatalogCategory = Readonly<ICategorize>;

/** Public, immutable component data needed to list and place a component. */
export interface DesignerCatalogComponent {
    readonly key: string;
    readonly baseInfo: Readonly<BaseInfoType>;
    readonly chartImage: string | null;
    /** Detached AI documentation metadata; never includes the source Definition or document body. */
    readonly aiDocumentation?: Readonly<{
        readonly componentType: string;
        readonly componentId?: string;
        readonly source: string;
        readonly componentVersion: string;
        readonly corpusVersion?: string;
        readonly sha256: string;
        readonly documentFormatVersion: string;
        readonly hasFullSpec: boolean;
        readonly componentInfo: Readonly<{
            readonly componentType: string;
            readonly componentName: string;
            readonly description: string;
            readonly nativeCapabilities: string;
            readonly selectable: boolean;
        }>;
    }>;
}

/** A fresh, detached initial component config returned by the runtime factory. */
export type DesignerCatalogInitialConfig = Record<string, unknown>;

/** Read-only access to component metadata and factory-created configuration data. */
export interface DesignerCatalog {
    listCategories(): readonly DesignerCatalogCategory[];
    listSubCategories(): readonly DesignerCatalogCategory[];
    listComponents(): readonly DesignerCatalogComponent[];
    getComponent(key: string): DesignerCatalogComponent | undefined;
    createInitialConfig(key: string): DesignerCatalogInitialConfig | undefined;
}

export interface DesignerCatalogAccess {
    prepare(): Promise<DesignerCatalog>;
}

declare module '../../plugin.js' {
    interface PluginServices {
        designerCatalog: DesignerCatalogAccess;
    }
}
