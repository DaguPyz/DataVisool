/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {AbstractDesignerController, AbstractDesignerDefinition as SdkDefinition} from "@datavisool/sdk/core";
import type {AbstractController} from "@datavisool/sdk/core";
import type {ComponentAiFeatureInfo} from "@datavisool/sdk/types";

export type {ActionInfo} from "@datavisool/sdk/core";

/** Web-specific AI metadata on top of the shared component definition. */
export default abstract class AbstractDesignerDefinition<C extends AbstractController = AbstractDesignerController, P = any> extends SdkDefinition<C, P> {
    getAiFeatureInfo(): ComponentAiFeatureInfo {
        const base = this.getBaseInfo();
        return {
            compKey: base.compKey,
            compName: base.compName,
            summary: `${base.compName}组件。`,
            featureTags: this.normalizeAiTextList([base.compName, base.categorize, base.subCategorize, base.source, ...this.getMenuList().map(item => item.name)]),
            applicableScenes: [],
            capabilities: this.normalizeAiTextList([...this.getActionList().map(item => item.name), ...this.getEventList().map(item => item.name)]),
            aliases: [],
            categorize: base.categorize,
            subCategorize: base.subCategorize,
            source: base.source,
            version: base.version,
        };
    }

    getAiStylePromptTs(): string {
        return "";
    }

    protected normalizeAiTextList(values: Array<string | null | undefined>): string[] {
        return Array.from(new Set(values.map(item => item?.trim()).filter((item): item is string => Boolean(item))));
    }
}
