/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {action, makeObservable, observable, runInAction, toJS} from "mobx";
import AbstractManager from "./core/AbstractManager.ts";
import {IFilterConfigType, IGlobalFilterManger} from "@datavisool/sdk/types";

const defaultConfig: Required<IFilterConfigType> = {
    enable: false,
    blur: 0,
    brightness: 1,
    contrast: 1,
    opacity: 1,
    saturate: 1,
    hueRotate: 0
};

export default class GlobalFilterManger extends AbstractManager<IGlobalFilterManger> {

    constructor() {
        super();
        makeObservable(this, {
            config: observable,
            setConfig: action,
            updateConfig: action,
        });
    }

    public config: IFilterConfigType = {...defaultConfig};

    public setConfig = (config: IFilterConfigType) => this.config = config;

    public updateConfig = (config: Partial<IFilterConfigType>) => this.config = {...this.config, ...config};

    public init(data: IGlobalFilterManger | undefined): void {
        runInAction(() => {
            this.config = {...defaultConfig, ...data?.config};
        });
    }

    public getData(): IGlobalFilterManger {
        return {config: toJS(this.config)};
    }

    public destroy(): void {
        runInAction(() => {
            this.config = {...defaultConfig};
        });
    }

    public getFilterStyle = () => {
        if (!this.config.enable) return {};
        const {blur = 0, brightness = 1, contrast = 1, opacity = 1, saturate = 1, hueRotate = 0} = this.config;
        return {
            filter: `blur(${blur}px) brightness(${brightness}) contrast(${contrast}) opacity(${opacity}) saturate(${saturate}) hue-rotate(${hueRotate}deg)`
        };
    }
}
