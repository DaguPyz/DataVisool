/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {WritableWordCloudOptions} from "@/comps/antd-common/types";
import {WordCloud} from "@antv/g2plot";
import type {UpdateOptions} from "@datavisool/sdk/types";
import {AntdBaseDesignerController} from "@/comps/antd-common/AntdBaseDesignerController";
import {ShapeAttrs} from "@antv/g-base";
import BPExecutor from "@/designer/blueprint/core/BPExecutor.ts";
import {ComponentBaseProps} from "@datavisool/sdk/types";
import {IThemeItem} from "@datavisool/sdk/types";

export interface AntdWordCloudProps extends ComponentBaseProps {
    style?: WritableWordCloudOptions;
}

export default class AntdWordCloudController extends AntdBaseDesignerController<WordCloud, AntdWordCloudProps> {

    async create(container: HTMLElement, config: AntdWordCloudProps, executor: BPExecutor, index?: number): Promise<void> {
        super.commonCreate(container, WordCloud, config, executor, index);
    }

    getConfig(): AntdWordCloudProps | null {
        return this.config;
    }

    registerEvent(): void {
        const nodeId = this.config?.base?.id ?? '';
        const _config = this.config;
        const executor = this.bpExecutor;
        this.instance?.on('plot:click', () => {
            executor?.triggerComponentEvent(nodeId!, "globalClick", _config, this.index)
        });
        this.instance?.on('dblclick', (params: any) => {
            const data = {selectedData: params?.data?.data, ..._config};
            executor?.triggerComponentEvent(nodeId!, "elementClick", data, this.index)
        });
    }

    update(config: AntdWordCloudProps, upOp?: UpdateOptions): void {
        super.commonUpdate(config, WordCloud, upOp);
    }

    updateTheme(newTheme: IThemeItem): void {
        if (!newTheme) return;
        const styleConfig = this.config?.style ?? {};
        const {colors: {main, mainText, supplementSecond, supplementFirst, subText}} = newTheme;
        //图形
        if (styleConfig?.color) {
            styleConfig.color = [main!, mainText!, subText!, supplementFirst!, supplementSecond!];
        }
        //图例
        if ((styleConfig.legend) && (styleConfig.legend.itemName?.style as ShapeAttrs)?.fill)
            (styleConfig!.legend!.itemName!.style as ShapeAttrs).fill = mainText;
        if ((styleConfig?.label) && (styleConfig?.label?.style as ShapeAttrs))
            (styleConfig!.label!.style as ShapeAttrs).fill = mainText;
        //重新渲染
        this.update({style: styleConfig} as AntdWordCloudProps, {reRender: true});
    }
}
