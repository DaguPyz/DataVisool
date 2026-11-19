/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {cloneDeep} from 'lodash';
import type {DesignerCatalog, DesignerCatalogComponent, DesignerCatalogInitialConfig} from '@datavisool/sdk/plugin/contracts/designerCatalog';
import type DesignerDefinitionRegistry from '@/plugins/designer-runtime/internal/designer/loader/DesignerDefinitionRegistry.ts';
import {componentDocumentIndex} from './internal/catalog/componentDocumentation.ts';

function readComponent(registry: DesignerDefinitionRegistry, key: string): DesignerCatalogComponent | undefined {
    const definition = registry.definitions[key];
    if (!definition) return;
    const baseInfo = Object.freeze(cloneDeep(definition.getBaseInfo()));
    const generatedDocument = componentDocumentIndex.documents.find(document => document.componentType === key);
    const document = registry.remoteComponents[key]?.documentInfo ?? generatedDocument;
    return Object.freeze({
        key,
        baseInfo,
        chartImage: definition.getChartImg(),
        ...(document ? {aiDocumentation: Object.freeze({
            ...cloneDeep(document),
            componentInfo: Object.freeze(cloneDeep(document.componentInfo)),
        })} : {}),
    });
}

/** Translate legacy definitions into detached data without exposing definition instances. */
export function createDesignerCatalog(registry: DesignerDefinitionRegistry): DesignerCatalog {
    return {
        listCategories() {
            return Object.freeze(registry.categories.map(item => Object.freeze({...item})));
        },
        listSubCategories() {
            return Object.freeze(registry.subCategories.map(item => Object.freeze({...item})));
        },
        listComponents() {
            return Object.freeze(Object.keys(registry.definitions)
                .map(key => readComponent(registry, key))
                .filter((component): component is DesignerCatalogComponent => component !== undefined));
        },
        getComponent(key) {
            return readComponent(registry, key);
        },
        createInitialConfig(key): DesignerCatalogInitialConfig | undefined {
            const definition = registry.definitions[key];
            if (!definition) return;
            const config: unknown = cloneDeep(definition.getInitConfig());
            if (!config || typeof config !== 'object' || Array.isArray(config)) return;
            return config as DesignerCatalogInitialConfig;
        },
    };
}
