/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import type AbstractDesignerDefinition from '@/framework/core/AbstractDesignerDefinition.ts';
import type {RuntimeBlueprintControllerRegistry} from '@/plugins/designer-runtime/internal/designer/blueprint/manager/BluePrintManager.ts';
import {createComponentCategories, createComponentSubCategories, type ICategorize} from './ComponentCategorize.ts';
import type {ComponentDocumentInfo} from '@/shared/components/ComponentDocumentationTypes.ts';

export interface RuntimeRemoteComponent {
    id: string;
    script: string;
    documentInfo?: ComponentDocumentInfo;
}

/** Runtime-local definitions and metadata registered while this plugin activation is alive. */
export default class DesignerDefinitionRegistry {
    readonly definitions: Record<string, AbstractDesignerDefinition> = {};
    readonly blueprintControllers: Record<string, RuntimeBlueprintControllerRegistry[string]> = {};
    readonly remoteComponents: Record<string, RuntimeRemoteComponent> = {};
    readonly categories: ICategorize[] = createComponentCategories();
    readonly subCategories: ICategorize[] = createComponentSubCategories();

    clear(): void {
        Object.keys(this.definitions).forEach(key => delete this.definitions[key]);
        Object.keys(this.blueprintControllers).forEach(key => delete this.blueprintControllers[key]);
        Object.keys(this.remoteComponents).forEach(key => delete this.remoteComponents[key]);
        this.categories.splice(0, this.categories.length, ...createComponentCategories());
        this.subCategories.splice(0, this.subCategories.length, ...createComponentSubCategories());
    }
}
