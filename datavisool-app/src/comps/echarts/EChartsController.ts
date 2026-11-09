/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {ComponentBaseProps, UpdateOptions} from "@datavisool/sdk/types";
import * as echarts from 'echarts';
import {EChartsType} from 'echarts';
import {ObjectUtil} from "@datavisool/sdk";
import AbstractDesignerController from "../../framework/core/AbstractDesignerController.ts";
import {debounce} from "lodash";
import BPExecutor from "../../designer/blueprint/core/BPExecutor.ts";
import {SafeEvalUtil} from "@/util/SafeEvalUtil.ts";

export interface EChartsStyle {
    customCode?: string;
    customDataUpdateCode?: string;
}

export interface EChartsProps extends ComponentBaseProps {
    style?: EChartsStyle;
}

export default class EChartsController extends AbstractDesignerController<EChartsType, EChartsProps> {

    private resizeObserver: ResizeObserver | null = null;

    async create(container: HTMLElement, config: EChartsProps, bpExecutor: BPExecutor, index?: number): Promise<void> {
        await super.create(container, config, bpExecutor, index);
        const customCode = config.style?.customCode;
        if (!customCode || customCode === "")
            return;
        const func = SafeEvalUtil.run(customCode);
        if (typeof func !== 'function')
            return;
        this.instance = func(container, echarts, config.data?.value);

        this.resizeObserver = new ResizeObserver(debounce(() => {
            this.instance?.resize()
        }, 100));
        // 开始观察
        this.resizeObserver?.observe(this.container!);
    }

    destroy(): void {
        this.instance?.dispose();
        this.instance = null;
        this.config = null;
        super.destroy();
        this.resizeObserver?.disconnect();
    }

    getConfig(): EChartsProps | null {
        return this.config;
    }


    changeData(data: any) {
        //由于Echarts图表的数据更新需要明确最新的数据结构，因此需要自定义处理
        const customDataUpdateCode = this.config?.style?.customDataUpdateCode;
        if (!customDataUpdateCode || customDataUpdateCode === "")
            return;
        const func = SafeEvalUtil.run(customDataUpdateCode);
        if (typeof func !== 'function')
            return;
        func(this.instance, data);
    }

    update(config: EChartsProps, upOp?: UpdateOptions): void {
        //合并最新的配置
        this.config = ObjectUtil.merge(this.config, config);
        upOp = upOp || {reRender: true};
        if (upOp.reRender) {
            //销毁之前的图表实例
            try {
                this.instance?.dispose();
            } catch (e) {
                while (this.container?.firstChild) {
                    this.container.removeChild(this.container.firstChild);
                }
            }
            const customCode = this.config?.style?.customCode;
            if (!customCode || customCode === "")
                return;
            const func = SafeEvalUtil.run(customCode);
            if (typeof func !== 'function')
                return;
            this.instance = func(this.container, echarts, this.config?.data?.value);
        }
    }

    setVisible(visible: boolean) {
        if (visible) {
            if (this.instance)
                return;
            //显示
            const customCode = this.config?.style?.customCode;
            if (!customCode || customCode === "")
                return;
            const func = SafeEvalUtil.run(customCode);
            if (typeof func !== 'function')
                return;
            this.instance = func(this.container, echarts, this.config?.data?.value);
        } else {
            //隐藏
            this.instance?.dispose();
            this.instance = null;
            //移除container下的所有子dom
            while (this.container?.firstChild) {
                this.container.removeChild(this.container.firstChild);
            }
        }
    }

}