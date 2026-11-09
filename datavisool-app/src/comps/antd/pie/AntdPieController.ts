/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {ComponentBaseProps} from "@datavisool/sdk/types";
import {IThemeItem} from "@datavisool/sdk/types";

import {WritablePieOptions} from "@/comps/antd-common/types";
import {Pie, StatisticText} from "@antv/g2plot";
import type {UpdateOptions} from "@datavisool/sdk/types";
import {AntdBaseDesignerController} from "@/comps/antd-common/AntdBaseDesignerController";
import {ShapeAttrs} from "@antv/g-base";
import {CSSProperties} from "react";
import BPExecutor from "@/designer/blueprint/core/BPExecutor.ts";

export interface AntdPieProps extends ComponentBaseProps {
    style?: WritablePieOptions;
}

export default class AntdPieController extends AntdBaseDesignerController<Pie, AntdPieProps> {

    async create(container: HTMLElement, config: AntdPieProps, executor: BPExecutor, index?: number): Promise<void> {
        super.commonCreate(container, Pie, config, executor, index);
    }

    getConfig(): AntdPieProps | null {
        return this.config;
    }

    update(config: AntdPieProps, upOp?: UpdateOptions): void {
        super.commonUpdate(config, Pie, upOp);
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
        if ((styleConfig?.pieStyle) && (styleConfig?.pieStyle as ShapeAttrs))
            (styleConfig!.pieStyle as ShapeAttrs).stroke = background;
        //标签
        if ((styleConfig?.label) && (styleConfig?.label?.style as ShapeAttrs))
            (styleConfig!.label!.style as ShapeAttrs).fill = mainText;
        //标题
        if ((styleConfig?.statistic) && (styleConfig?.statistic?.title) && (styleConfig.statistic.title as StatisticText).style)
            ((styleConfig!.statistic!.title as StatisticText).style as CSSProperties)!.color = mainText!;
        //内容
        if ((styleConfig?.statistic) && (styleConfig?.statistic?.content) && (styleConfig.statistic.content as StatisticText).style)
            ((styleConfig!.statistic!.content as StatisticText).style as CSSProperties)!.color = subText!;
        //重新渲染
        this.update({style: styleConfig} as AntdPieProps, {reRender: true});
    }
}
