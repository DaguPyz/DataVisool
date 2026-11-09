/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {action, makeObservable, observable, runInAction, toJS} from "mobx";
import AbstractManager from "@/designer/manager/core/AbstractManager.ts";
import {ICanvasManager} from "@datavisool/sdk/types";

class CanvasManager extends AbstractManager<ICanvasManager> {

    constructor() {
        super();
        makeObservable(this, {
            canvasConfig: observable,
            updateCanvasConfig: action,
        })
    }

    canvasConfig: ICanvasManager = {
        rasterize: false, //是否栅格化
        dragStep: 1, //栅格化拖拽步长
        resizeStep: 1, //栅格化缩放步长
        width: 1920, //画布宽
        height: 1080, //画布高
        adaptationType: 'scale', //屏幕适配
        boxSelectionMode: 'intersect' //框选命中模式
    };

    updateCanvasConfig = (data: ICanvasManager) => this.canvasConfig = {...this.canvasConfig, ...data};

    public init(data: ICanvasManager): void {
        runInAction(() => {
            this.canvasConfig = data ? {...this.canvasConfig, ...data} : this.canvasConfig;
        })
    }

    public getData = (): ICanvasManager => {
        return toJS(this.canvasConfig!)
    }

    public destroy = () => {
        runInAction(() => {
            this.canvasConfig = {}
        });
    }

}

export default CanvasManager;
