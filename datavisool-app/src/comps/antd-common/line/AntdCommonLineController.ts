/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {WritableLineOptions} from "@/comps/antd-common/types";
import {Line} from "@antv/g2plot";
import type {UpdateOptions} from "@datavisool/sdk/types";
import {AntdBaseDesignerController} from "@/comps/antd-common/AntdBaseDesignerController";
import {ShapeAttrs} from "@antv/g-base";
import BPExecutor from "@/designer/blueprint/core/BPExecutor.ts";
import {ComponentBaseProps} from "@datavisool/sdk/types";
import {IThemeItem} from "@datavisool/sdk/types";

export interface AntdLineProps extends ComponentBaseProps {
    style?: WritableLineOptions;
}

export default class AntdCommonLineController extends AntdBaseDesignerController<Line, AntdLineProps> {

    async create(container: HTMLElement, config: AntdLineProps, executor: BPExecutor, index?: number): Promise<void> {
        super.commonCreate(container, Line, config, executor, index);
    }

    getConfig(): AntdLineProps | null {
        return this.config;
    }

    update(config: AntdLineProps, upOp?: UpdateOptions): void {
        super.commonUpdate(config, Line, upOp);
    }

    updateTheme(newTheme: IThemeItem): void {
        if (!newTheme)
            return;
        const {type} = this.config?.base ?? {};
        const styleConfig = this.config?.style ?? {};
        const {colors: {main, background, mainText, supplementSecond, supplementFirst, subText}} = newTheme;
        //图形
        if (styleConfig?.color) {
            if (type === 'AntdMultiLine')
                styleConfig.color = [main!, mainText!, supplementFirst!, supplementSecond!, subText!, background!];
            else
                styleConfig.color = main;
        }
        //点
        if (styleConfig?.point?.color) {
            if (type === 'AntdMultiLine') {
                (styleConfig!.point as any)!.color = [main!, mainText!, supplementFirst!, supplementSecond!, subText!, background!];
            } else {
                (styleConfig!.point as any)!.color = main;
            }
        }
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
        //y轴-文本
        if ((styleConfig?.yAxis) && (styleConfig?.yAxis?.label?.style as ShapeAttrs)?.fill)
            (styleConfig!.yAxis!.label!.style as ShapeAttrs).fill = mainText;
        //y轴-标题
        if ((styleConfig?.yAxis) && (styleConfig?.yAxis?.title as ShapeAttrs)?.fill)
            (styleConfig!.yAxis!.title!.style as ShapeAttrs).fill = mainText;
        //y轴-轴线
        if ((styleConfig?.yAxis) && (styleConfig?.yAxis?.line?.style as ShapeAttrs)?.stroke)
            (styleConfig!.yAxis!.line!.style as ShapeAttrs).stroke = supplementSecond;
        //y轴-网格线
        if ((styleConfig?.yAxis) && (styleConfig?.yAxis?.grid?.line?.style as ShapeAttrs)?.stroke)
            (styleConfig!.yAxis!.grid!.line!.style as ShapeAttrs).stroke = subText;
        //y轴-刻度线
        if ((styleConfig?.yAxis) && (styleConfig?.yAxis?.tickLine?.style as ShapeAttrs)?.stroke)
            (styleConfig!.yAxis!.tickLine!.style as ShapeAttrs).stroke = supplementFirst;
        //y轴-子刻度线
        if ((styleConfig?.yAxis) && (styleConfig?.yAxis?.subTickLine?.style as ShapeAttrs)?.stroke)
            (styleConfig!.yAxis!.subTickLine!.style as ShapeAttrs).stroke = subText;
        //重新渲染
        this.update({style: styleConfig} as AntdLineProps, {reRender: true});
    }
}
