/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {WritableRadarOptions} from "@/comps/antd-common/types";
import {Radar} from "@antv/g2plot";
import type {UpdateOptions} from "@datavisool/sdk/types";
import {AntdBaseDesignerController} from "@/comps/antd-common/AntdBaseDesignerController";
import {ComponentBaseProps} from "@datavisool/sdk/types";
import {IThemeItem} from "@datavisool/sdk/types";

import BPExecutor from "@/designer/blueprint/core/BPExecutor.ts";
import {AntdLineProps} from "@/comps/antd-common/line/AntdCommonLineController.ts";
import {ShapeAttrs} from "@antv/g-base";

export interface AntdRadarProps extends ComponentBaseProps {
    style?: WritableRadarOptions;
}

export default class AntdRadarController extends AntdBaseDesignerController<Radar, AntdRadarProps> {

    async create(container: HTMLElement, config: AntdRadarProps, executor: BPExecutor, index?: number): Promise<void> {
        super.commonCreate(container, Radar, config, executor, index);
    }

    getConfig(): AntdRadarProps | null {
        return this.config;
    }

    changeData(data: any) {
        if (this.config?.data)
            this.config.data.value = data;
        if (this.config?.style)
            this.config.style.data = data;
        this.instance?.changeData(data);
    }


    update(config: AntdRadarProps, upOp?: UpdateOptions): void {
        super.commonUpdate(config, Radar, upOp);
    }

    updateTheme(newTheme: IThemeItem): void {
        const {main, mainText, subText, supplementFirst, supplementSecond} = newTheme.colors;
        const styleConfig = this.config?.style ?? {};
        if ((styleConfig?.lineStyle as ShapeAttrs)?.stroke)
            (styleConfig!.lineStyle as ShapeAttrs).stroke = main;
        if ((styleConfig?.point?.style as ShapeAttrs)?.fill)
            (styleConfig!.point!.style as ShapeAttrs).fill = subText;
        if ((styleConfig?.point?.style as ShapeAttrs)?.stroke)
            (styleConfig!.point!.style as ShapeAttrs).stroke = supplementFirst;
        if ((styleConfig?.area?.style as ShapeAttrs)?.fill)
            (styleConfig!.area!.style as ShapeAttrs).fill = main;
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
