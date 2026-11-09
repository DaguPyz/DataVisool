/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {WritableRingProgressOptions} from "@/comps/antd-common/types";
import {RingProgress, StatisticText} from "@antv/g2plot";
import type {UpdateOptions} from "@datavisool/sdk/types";
import {AntdBaseDesignerController} from "@/comps/antd-common/AntdBaseDesignerController";
import {CSSProperties} from "react";
import BPExecutor from "@/designer/blueprint/core/BPExecutor.ts";
import {ComponentBaseProps} from "@datavisool/sdk/types";
import {IThemeItem} from "@datavisool/sdk/types";

export interface AntdRingProgressProps extends ComponentBaseProps {
    style?: WritableRingProgressOptions;
}

export default class AntdRingProgressController extends AntdBaseDesignerController<RingProgress, AntdRingProgressProps> {

    async create(container: HTMLElement, config: AntdRingProgressProps, bpExecutor: BPExecutor, index?: number): Promise<void> {
        super.commonCreate(container, RingProgress, config, bpExecutor, index);
    }

    getConfig(): AntdRingProgressProps | null {
        return this.config;
    }

    changeData(data: any) {
        //data.value是LC表中组件属性存储静态数据的地方，也作为其他数据源存储结果的中转站，更新数据时应该同时更新data.value属性
        if (this.config?.data?.value)
            this.config.data.value = data;
        this.instance?.changeData(data);
        if (this.config?.style)
            this.config.style['percent'] = data;
    }

    update(config: AntdRingProgressProps, upOp?: UpdateOptions): void {
        super.commonUpdate(config, RingProgress, upOp);
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
        if (!newTheme) return;
        const styleConfig = this.config?.style ?? {};
        const {colors: {main, mainText, supplementFirst, subText}} = newTheme;
        //图形
        if (styleConfig?.color) {
            styleConfig.color = [main!, supplementFirst!];
        }
        //标题
        if ((styleConfig?.statistic) && (styleConfig?.statistic?.title) && (styleConfig.statistic.title as StatisticText).style)
            ((styleConfig!.statistic!.title as StatisticText).style as CSSProperties)!.color = mainText!;
        //内容
        if ((styleConfig?.statistic) && (styleConfig?.statistic?.content) && (styleConfig.statistic.content as StatisticText).style)
            ((styleConfig!.statistic!.content as StatisticText).style as CSSProperties)!.color = subText!;
        //重新渲染
        this.update({style: styleConfig} as AntdRingProgressProps, {reRender: true});
    }
}
