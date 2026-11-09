/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {WritableRadialBarOptions} from "@/comps/antd-common/types";
import {RadialBar} from "@antv/g2plot";
import type {UpdateOptions} from "@datavisool/sdk/types";
import {AntdBaseDesignerController} from "@/comps/antd-common/AntdBaseDesignerController";
import BPExecutor from "@/designer/blueprint/core/BPExecutor.ts";
import {AntdLineProps} from "@/comps/antd-common/line/AntdCommonLineController.ts";
import {ShapeAttrs} from "@antv/g-base";
import {ComponentBaseProps} from "@datavisool/sdk/types";
import {IThemeItem} from "@datavisool/sdk/types";

export interface AntdRadialBarProps extends ComponentBaseProps {
    style?: WritableRadialBarOptions;
}

export default class AntdBaseRadialBarController extends AntdBaseDesignerController<RadialBar, AntdRadialBarProps> {

    async create(container: HTMLElement, config: AntdRadialBarProps, executor: BPExecutor, index?: number): Promise<void> {
        super.commonCreate(container, RadialBar, config, executor, index);
    }

    getConfig(): AntdRadialBarProps | null {
        return this.config;
    }

    update(config: AntdRadialBarProps, upOp?: UpdateOptions): void {
        super.commonUpdate(config, RadialBar, upOp);
    }

    updateTheme(newTheme: IThemeItem): void {
        if (!newTheme)
            return;
        const styleConfig = this.config?.style ?? {};
        const {colors: {main, background, mainText, supplementSecond, supplementFirst, subText}} = newTheme;
        //图形
        if (styleConfig?.color)
            styleConfig.color = [main!, mainText!, subText!, supplementFirst!, supplementSecond!, background!];
        //图例
        if ((styleConfig.legend) && (styleConfig.legend.itemName?.style as ShapeAttrs)?.fill)
            (styleConfig!.legend!.itemName!.style as ShapeAttrs).fill = mainText;
        //x轴-文本
        if ((styleConfig?.xAxis) && (styleConfig?.xAxis?.label?.style as ShapeAttrs)?.fill)
            (styleConfig!.xAxis!.label!.style as ShapeAttrs).fill = mainText;
        //x轴-标题
        if ((styleConfig?.xAxis) && (styleConfig?.xAxis?.title as ShapeAttrs)?.fill)
            (styleConfig!.xAxis!.title!.style as ShapeAttrs).fill = mainText;
        //x轴-轴线
        if ((styleConfig?.xAxis) && (styleConfig?.xAxis?.line?.style as ShapeAttrs)?.stroke)
            (styleConfig!.xAxis!.line!.style as ShapeAttrs).stroke = supplementSecond;
        //x轴-网格线
        if ((styleConfig?.xAxis) && (styleConfig?.xAxis?.grid?.line?.style as ShapeAttrs)?.stroke)
            (styleConfig!.xAxis!.grid!.line!.style as ShapeAttrs).stroke = subText;
        //x轴-刻度线
        if ((styleConfig?.xAxis) && (styleConfig?.xAxis?.tickLine?.style as ShapeAttrs)?.stroke)
            (styleConfig!.xAxis!.tickLine!.style as ShapeAttrs).stroke = supplementFirst;
        //x轴-子刻度线
        if ((styleConfig?.xAxis) && (styleConfig?.xAxis?.subTickLine?.style as ShapeAttrs)?.stroke)
            (styleConfig!.xAxis!.subTickLine!.style as ShapeAttrs).stroke = subText;
        //重新渲染
        this.update({style: styleConfig} as AntdLineProps, {reRender: true});
    }
}
