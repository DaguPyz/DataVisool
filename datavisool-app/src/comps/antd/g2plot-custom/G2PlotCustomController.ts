/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import * as G2Plot from "@antv/g2plot";
import {Plot} from "@antv/g2plot";
import type {UpdateOptions} from "@datavisool/sdk/types";
import {AntdBaseDesignerController} from "@/comps/antd-common/AntdBaseDesignerController";
import {ObjectUtil} from "@datavisool/sdk";
import {ComponentBaseProps} from "@datavisool/sdk/types";
import BPExecutor from "@/designer/blueprint/core/BPExecutor.ts";
import {SafeEvalUtil} from "@/util/SafeEvalUtil.ts";

export interface G2PlotCustomStyle {
    customCode: string;
}

export interface G2PlotCustomProps extends ComponentBaseProps {
    style?: G2PlotCustomStyle;
}

export default class G2PlotCustomController extends AntdBaseDesignerController<Plot<any>, G2PlotCustomProps> {

    async create(container: HTMLElement, config: G2PlotCustomProps, bpExecutor: BPExecutor, index?: number): Promise<void> {
        await super.create(container, config, bpExecutor, index);
        const customCode = config.style?.customCode;
        if (!customCode || customCode === "")
            return;
        const func = SafeEvalUtil.run(customCode);
        if (typeof func !== 'function')
            return;
        this.instance = func(container, G2Plot, config.data?.value);
    }

    getConfig(): G2PlotCustomProps | null {
        return this.config;
    }


    changeData(data: any) {
        if (this.config?.data)
            this.config.data.value = data;
        this.instance?.changeData(data);
    }

    update(config: G2PlotCustomProps, upOp?: UpdateOptions): void {
        //合并最新的配置
        this.config = ObjectUtil.merge(this.config, config);
        upOp = upOp || {reRender: true};
        if (upOp.reRender) {
            //销毁之前的图表实例
            try {
                this.instance?.destroy();
            } catch (e) {
                while (this.container?.firstChild) {
                    this.container.removeChild(this.container.firstChild);
                }
            }
            const customCode = config.style?.customCode;
            if (!customCode || customCode === "")
                return;
            const func = SafeEvalUtil.run(customCode);
            if (typeof func !== 'function')
                return;
            this.instance = func(this.container, G2Plot, this.config?.data?.value);
        }
    }

}
