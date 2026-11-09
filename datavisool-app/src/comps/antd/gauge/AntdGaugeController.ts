/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {WritableGaugeOptions} from "@/comps/antd-common/types";
import {Gauge} from "@antv/g2plot";
import type {UpdateOptions} from "@datavisool/sdk/types";
import {AntdBaseDesignerController} from "@/comps/antd-common/AntdBaseDesignerController";
import BPExecutor from "@/designer/blueprint/core/BPExecutor.ts";
import {ShapeAttrs} from "@antv/g-base";
import {AntdLineProps} from "@/comps/antd-common/line/AntdCommonLineController.ts";
import {ComponentBaseProps} from "@datavisool/sdk/types";
import {IThemeItem} from "@datavisool/sdk/types";

export interface AntdGaugeProps extends ComponentBaseProps {
    style?: WritableGaugeOptions;
}

export default class AntdGaugeController extends AntdBaseDesignerController<Gauge, AntdGaugeProps> {

    async create(container: HTMLElement, config: AntdGaugeProps, executor: BPExecutor, index?: number): Promise<void> {
        super.commonCreate(container, Gauge, config, executor, index);
    }

    getConfig(): AntdGaugeProps | null {
        return this.config;
    }


    changeData(data: any) {
        if (this.config?.data)
            this.config.data.value = data;
        if (this.config?.style)
            this.config.style.percent = data;
        this.instance?.changeData(data);
    }

    update(config: AntdGaugeProps, upOp?: UpdateOptions): void {
        super.commonUpdate(config, Gauge, upOp);
    }

    registerEvent(): void {
        const nodeId = this.config?.base?.id ?? '';
        const _config = this.config;
        const executor = this.bpExecutor;
        this.instance?.on('plot:click', () => {
            executor?.triggerComponentEvent(nodeId!, "globalClick", _config, this.index)
        });
        this.instance?.on('element:click', (params: any) => {
            const data = {selectedData: params?.data?.data, ..._config};
            executor?.triggerComponentEvent(nodeId!, "elementClick", data, this.index)
        });
    }

    updateTheme(newTheme: IThemeItem): void {
        const {main, mainText, subText, supplementSecond, supplementFirst} = newTheme.colors;
        const styleConfig = this.config?.style ?? {};
        if (styleConfig.range?.color)
            (styleConfig.range.color as string[]) = [main!, mainText!];
        //刻度轴-文本
        if ((styleConfig?.axis) && (styleConfig?.axis?.label?.style as ShapeAttrs)?.fill)
            (styleConfig!.axis!.label!.style as ShapeAttrs).fill = mainText;
        //刻度轴-标题
        if ((styleConfig?.axis) && (styleConfig?.axis?.title as ShapeAttrs)?.fill)
            (styleConfig!.axis!.title!.style as ShapeAttrs).fill = mainText;
        //刻度轴-轴线
        if ((styleConfig?.axis) && (styleConfig?.axis?.line?.style as ShapeAttrs)?.stroke)
            (styleConfig!.axis!.line!.style as ShapeAttrs).stroke = supplementSecond;
        //刻度轴-网格线
        if ((styleConfig?.axis) && (styleConfig?.axis?.grid?.line?.style as ShapeAttrs)?.stroke)
            (styleConfig!.axis!.grid!.line!.style as ShapeAttrs).stroke = subText;
        //刻度轴-刻度线
        if ((styleConfig?.axis) && (styleConfig?.axis?.tickLine?.style as ShapeAttrs)?.stroke)
            (styleConfig!.axis!.tickLine!.style as ShapeAttrs).stroke = supplementFirst;
        //刻度轴-子刻度线
        if ((styleConfig?.axis) && (styleConfig?.axis?.subTickLine?.style as ShapeAttrs)?.stroke)
            (styleConfig!.axis!.subTickLine!.style as ShapeAttrs).stroke = subText;
        //指针
        if (styleConfig.indicator) {
            //指针线
            if ((styleConfig.indicator.pin as ShapeAttrs)?.style?.stroke)
                (styleConfig.indicator.pin as ShapeAttrs).style.stroke = subText;
            if ((styleConfig.indicator.pin as ShapeAttrs)?.style?.fill)
                (styleConfig.indicator.pin as ShapeAttrs).style.fill = mainText;
            //指针点
            if ((styleConfig.indicator.pointer as ShapeAttrs)?.style?.stroke)
                (styleConfig.indicator.pointer as ShapeAttrs).style.stroke = subText;
        }
        //文本
        if ((styleConfig?.statistic?.content as ShapeAttrs)?.style?.color) {
            (styleConfig.statistic!.content as ShapeAttrs).style.color = mainText;
        }
        //重新渲染
        this.update({style: styleConfig} as AntdLineProps, {reRender: true});
    }
}
