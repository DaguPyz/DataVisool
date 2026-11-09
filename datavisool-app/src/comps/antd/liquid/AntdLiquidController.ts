/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {ComponentBaseProps} from "@datavisool/sdk/types";
import {IThemeItem} from "@datavisool/sdk/types";

import {WritableLiquidOptions} from "@/comps/antd-common/types";
import {Liquid} from "@antv/g2plot";
import type {UpdateOptions} from "@datavisool/sdk/types";
import {AntdBaseDesignerController} from "@/comps/antd-common/AntdBaseDesignerController";
import BPExecutor from "@/designer/blueprint/core/BPExecutor.ts";
import {AntdLineProps} from "@/comps/antd-common/line/AntdCommonLineController.ts";
import {IShape, ShapeAttrs} from "@antv/g-base";

export interface AntdLiquidProps extends ComponentBaseProps {
    style?: WritableLiquidOptions;
}

export default class AntdLiquidController extends AntdBaseDesignerController<Liquid, AntdLiquidProps> {

    async create(container: HTMLElement, config: AntdLiquidProps, executor: BPExecutor, index?: number): Promise<void> {
        super.commonCreate(container, Liquid, config, executor, index);
    }

    getConfig(): AntdLiquidProps | null {
        return this.config;
    }

    private restoreWaterWaveAnimation() {
        if (!this.instance || this.config?.style?.animation === false)
            return;
        const waves = this.instance.chart.getCanvas().findAll(
            element => element.get('name') === 'waterwave-path'
        ) as IShape[];
        const waveLength = this.config?.style?.wave?.length ?? 192;
        waves.forEach((wave, index) => {
            const factor = waves.length <= 1 ? 1 : index / (waves.length - 1);
            const currentMatrix = wave.getMatrix();
            const targetMatrix = currentMatrix?.length === 9
                ? [...currentMatrix]
                : [1, 0, 0, 0, 1, 0, 0, 0, 1];
            const currentX = targetMatrix[6] ?? 0;
            targetMatrix[6] = waveLength > 0
                ? ((currentX % waveLength) + waveLength) % waveLength
                : currentX;
            wave.setMatrix(targetMatrix);
            const nextMatrix = [...targetMatrix];
            nextMatrix[6] += waveLength;
            wave.animate(
                {matrix: nextMatrix},
                {duration: 2500 + 2500 * factor, repeat: true}
            );
        });
    }

    changeData(data: any) {
        if (this.config?.data)
            this.config.data.value = data;
        if (this.config?.style)
            this.config.style.percent = data;
        this.instance?.changeData(data);
        this.restoreWaterWaveAnimation();
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

    update(config: AntdLiquidProps, upOp?: UpdateOptions): void {
        super.commonUpdate(config, Liquid, upOp);
    }

    updateTheme(newTheme: IThemeItem): void {
        const {main, mainText, background, subText, supplementFirst} = newTheme.colors;
        const styleConfig = this.config?.style ?? {};
        if ((styleConfig.liquidStyle as ShapeAttrs)?.fill)
            (styleConfig.liquidStyle as ShapeAttrs).fill = main;
        if ((styleConfig.liquidStyle as ShapeAttrs)?.stroke)
            (styleConfig.liquidStyle as ShapeAttrs).stroke = mainText;
        if ((styleConfig.shapeStyle as ShapeAttrs)?.fill)
            (styleConfig.shapeStyle as ShapeAttrs).fill = background;
        if ((styleConfig.outline?.style as ShapeAttrs)?.style?.stroke)
            (styleConfig.outline?.style as ShapeAttrs).style.stroke = supplementFirst;
        //文本
        if ((styleConfig?.statistic?.content as ShapeAttrs)?.style?.color)
            (styleConfig.statistic!.content as ShapeAttrs).style.color = subText;
        if ((styleConfig?.statistic?.title as ShapeAttrs)?.style?.color)
            (styleConfig.statistic!.title as ShapeAttrs).style.color = mainText;
        //重新渲染
        this.update({style: styleConfig} as AntdLineProps, {reRender: true});
    }
}
