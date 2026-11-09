/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {ComponentBaseProps} from "@datavisool/sdk/types";
import {IThemeItem} from "@datavisool/sdk/types";

import {WritableRoseOptions} from "@/comps/antd-common/types";
import {Rose} from "@antv/g2plot";
import type {UpdateOptions} from "@datavisool/sdk/types";
import {AntdBaseDesignerController} from "@/comps/antd-common/AntdBaseDesignerController";
import {ShapeAttrs} from "@antv/g-base";
import BPExecutor from "@/designer/blueprint/core/BPExecutor.ts";

export interface AntdRoseProps extends ComponentBaseProps {
    style?: WritableRoseOptions;
}

export default class AntdCommonRoseController extends AntdBaseDesignerController<Rose, AntdRoseProps> {

    async create(container: HTMLElement, config: AntdRoseProps, executor: BPExecutor, index?: number): Promise<void> {
        super.commonCreate(container, Rose, config, executor, index);
    }

    getConfig(): AntdRoseProps | null {
        return this.config;
    }

    update(config: AntdRoseProps, upOp?: UpdateOptions): void {
        super.commonUpdate(config, Rose, upOp);
    }

    updateTheme(newTheme: IThemeItem): void {
        if (!newTheme) return;
        const styleConfig = this.config?.style ?? {};
        const {colors: {main, mainText, supplementSecond, background, supplementFirst, subText}} = newTheme;
        //图形
        if (styleConfig?.color) {
            styleConfig.color = [main!, mainText!, subText!, supplementFirst!, supplementSecond!];
        }
        //图例
        if ((styleConfig.legend) && (styleConfig.legend.itemName?.style as ShapeAttrs)?.fill)
            (styleConfig!.legend!.itemName!.style as ShapeAttrs).fill = mainText;
        //描边
        if ((styleConfig?.sectorStyle) && (styleConfig?.sectorStyle as ShapeAttrs))
            (styleConfig!.sectorStyle as ShapeAttrs).stroke = background;
        //标签
        if ((styleConfig?.label) && (styleConfig?.label?.style as ShapeAttrs))
            (styleConfig!.label!.style as ShapeAttrs).fill = mainText;
        //重新渲染
        this.update({style: styleConfig} as AntdRoseProps, {reRender: true});
    }
}
