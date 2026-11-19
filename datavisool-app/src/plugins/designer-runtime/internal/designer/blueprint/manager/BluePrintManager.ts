/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {cloneDeep} from 'lodash';
import {IdGenerate as idGenerate} from '@datavisool/sdk';
import {DesignerMode} from '@datavisool/sdk/types';
import type {BPNodeLayoutType, IBluePrintManager} from '@datavisool/sdk/types';
import type {AbstractBPNodeController} from '@/plugins/designer-runtime/internal/designer/blueprint/node/core/AbstractBPNodeController.ts';
import type {DesignerBlueprintPage} from '@datavisool/sdk/plugin/contracts/designerBlueprint';
import BluePrintPageManager from './BluePrintPageManager.ts';

export const MAX_BLUEPRINT_PAGE_COUNT = 2048;

export const sanitizeBluePrintPages = (data?: Array<IBluePrintManager | null | undefined>) => {
    if (!Array.isArray(data) || data.length === 0) return [];
    const sanitized: IBluePrintManager[] = [];
    const seenPageIds = new Set<string>();
    let duplicateCount = 0;
    let invalidCount = 0;
    let truncatedCount = 0;

    for (const item of data) {
        if (!item || typeof item !== 'object') {
            invalidCount++;
            continue;
        }
        const pageId = typeof item.pageId === 'string' ? item.pageId.trim() : '';
        if (pageId) {
            if (seenPageIds.has(pageId)) {
                duplicateCount++;
                continue;
            }
            seenPageIds.add(pageId);
        }
        if (sanitized.length >= MAX_BLUEPRINT_PAGE_COUNT) {
            truncatedCount++;
            continue;
        }
        sanitized.push(item);
    }

    if (duplicateCount > 0 || invalidCount > 0 || truncatedCount > 0) {
        console.warn(`[BluePrintManager] sanitized blueprint pages: kept=${sanitized.length}, duplicates=${duplicateCount}, invalid=${invalidCount}, truncated=${truncatedCount}`);
    }
    return sanitized;
};

export type RuntimeBlueprintControllerConstructor = new (config?: any) => AbstractBPNodeController<any>;
export type RuntimeBlueprintControllerRegistry = Readonly<Record<string, RuntimeBlueprintControllerConstructor>>;

/** Persisted blueprint pages and preview/release executors; editor presentation lives in editor-blueprint. */
export default class BluePrintManager {
    public bpPageMangers: BluePrintPageManager[] = [];

    public init(data: IBluePrintManager[], mode: DesignerMode, registry: RuntimeBlueprintControllerRegistry = {}): void {
        this.destroy();
        const pages = sanitizeBluePrintPages(data);
        if (pages.length === 0) {
            const page = new BluePrintPageManager();
            page.pageId = idGenerate.generateId();
            page.pageName = '默认页面';
            this.bpPageMangers = [page];
            return;
        }

        this.bpPageMangers = pages.map(pageData => {
            const page = new BluePrintPageManager();
            page.init(cloneDeep(pageData));
            if (mode !== DesignerMode.EDIT) {
                const controllers: Record<string, AbstractBPNodeController<any>> = {};
                Object.values(page.bpNodeLayoutMap).forEach((layout: BPNodeLayoutType) => {
                    const {type, id} = layout;
                    const Controller = type ? registry[type] : undefined;
                    if (!Controller) {
                        console.warn(`[BluePrintManager] missing blueprint controller for type="${type ?? ''}"`);
                        return;
                    }
                    const config = page.bpNodeConfigMap[id ?? ''];
                    if (id) controllers[id] = new Controller(cloneDeep(config));
                });
                page.bpNodeControllers = controllers;
            }
            return page;
        });
    }

    /** Replace serialized graph data from the active editing-scene service. */
    public replacePages(pages: readonly IBluePrintManager[]): void {
        this.bpPageMangers.forEach(page => page.destroy());
        this.bpPageMangers = pages.map(pageData => {
            const page = new BluePrintPageManager();
            page.init(cloneDeep(pageData));
            return page;
        });
    }

    public getData(): DesignerBlueprintPage[] {
        return this.bpPageMangers.map(page => cloneDeep(page.getData()));
    }

    public destroy(): void {
        const errors: unknown[] = [];
        this.bpPageMangers.forEach(page => {
            try { page.destroy(); } catch (error) { errors.push(error); }
        });
        this.bpPageMangers = [];
        if (errors.length) throw new AggregateError(errors, 'Failed to destroy blueprint pages.');
    }
}
