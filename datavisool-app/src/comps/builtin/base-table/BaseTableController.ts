/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import type {UpdateOptions} from "@datavisool/sdk/types";
import AbstractDesignerController from "@/framework/core/AbstractDesignerController";
import ComponentUtil from "@/util/ComponentUtil.ts";
import BaseTableComponent, {
    BaseTableComponentProps,
    BaseTableComponentRef,
    BaseTableComponentStyle,
    ITableBodyStyle
} from "./BaseTableComponent";
import {ObjectUtil} from "@datavisool/sdk";
import {IThemeItem} from "@datavisool/sdk/types";
import BPExecutor from "@/designer/blueprint/core/BPExecutor.ts";
import {DesignerMode} from "@datavisool/sdk/types";

interface TableCarouselRuntime {
    enabled: boolean;
    rowStep: number;
    durationMs: number;
    pauseMs: number;
    dataLength: number;
}

const toBoolean = (value: unknown) => value === true || value === 'true' || value === 1 || value === '1';

const normalizeNumber = (value: unknown, fallback: number) => {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : fallback;
};

const getTableDataLength = (config?: BaseTableComponentProps | null) => {
    const data = config?.style?.data;
    return Array.isArray(data) ? data.length : 0;
};

const normalizeBaseTableStyle = (style?: BaseTableComponentStyle | null): BaseTableComponentStyle => {
    const body = {...(style?.body ?? {})};
    const normalizedBody: ITableBodyStyle = {
        ...body,
        enableCarousel: toBoolean(body.enableCarousel ?? false),
        carouselSpeed: normalizeNumber(body.carouselSpeed, 3),
        carouselPauseSeconds: normalizeNumber(body.carouselPauseSeconds, 0.08),
    };
    return {
        ...(style ?? {}),
        body: normalizedBody,
    };
};

const normalizeBaseTableConfig = (config: BaseTableComponentProps): BaseTableComponentProps => ({
    ...config,
    style: normalizeBaseTableStyle(config?.style),
});

export class BaseTableController extends AbstractDesignerController<BaseTableComponentRef, BaseTableComponentProps> {
    private initialized = false;
    private isVisible = true;
    private carouselTimer: number | null = null;
    private carouselFrameTimer: number | null = null;

    private clearCarouselTimers() {
        if (this.carouselTimer != null) {
            clearTimeout(this.carouselTimer);
            this.carouselTimer = null;
        }
        if (this.carouselFrameTimer != null) {
            cancelAnimationFrame(this.carouselFrameTimer);
            this.carouselFrameTimer = null;
        }
    }

    private stopCarousel(resetView = true) {
        this.clearCarouselTimers();
        if (resetView)
            this.instance?.resetCarouselRows?.(getTableDataLength(this.config));
    }

    private getCarouselRuntime(): TableCarouselRuntime {
        const style = normalizeBaseTableStyle(this.config?.style);
        const body = style.body ?? {};
        const metrics = this.instance?.getCarouselMetrics?.();
        const dataLength = metrics?.dataLength ?? (Array.isArray(style.data) ? style.data.length : 0);
        const rowStep = metrics?.rowStep ?? 0;
        const speed = Number(body.carouselSpeed ?? 3);
        const durationMs = speed > 0 ? Math.max(120, Math.round(1000 / speed)) : 0;
        const pauseSeconds = Number(body.carouselPauseSeconds ?? 0.08);
        const pauseMs = Math.max(0, Math.round((Number.isFinite(pauseSeconds) ? pauseSeconds : 0) * 1000));
        const enabled = window.DATAVISOOL_ENV.mode !== DesignerMode.EDIT
            && this.isVisible
            && Boolean(body.enableCarousel)
            && dataLength > 1
            && rowStep > 0
            && durationMs > 0;
        return {enabled, rowStep, durationMs, pauseMs, dataLength};
    }

    private refreshCarouselRuntime() {
        if (!this.initialized || !this.instance)
            return;
        this.stopCarousel(true);
        this.carouselFrameTimer = window.requestAnimationFrame(() => {
            this.carouselFrameTimer = null;
            const runtime = this.getCarouselRuntime();
            if (!runtime.enabled)
                return;
            this.runCarouselCycle(runtime);
        });
    }

    private runCarouselCycle(runtime: TableCarouselRuntime) {
        if (!runtime.enabled || !this.instance) {
            this.stopCarousel(true);
            return;
        }
        if (this.carouselTimer != null) {
            clearTimeout(this.carouselTimer);
            this.carouselTimer = null;
        }
        this.instance?.setCarouselState?.({
            offset: -runtime.rowStep,
            transitionMs: runtime.durationMs,
        });
        this.carouselTimer = window.setTimeout(() => {
            this.carouselTimer = null;
            const nextRuntime = this.getCarouselRuntime();
            if (!nextRuntime.enabled || !this.instance) {
                this.stopCarousel(true);
                return;
            }
            this.instance?.advanceCarouselRows?.(1);
            this.carouselFrameTimer = window.requestAnimationFrame(() => {
                this.carouselFrameTimer = null;
                const currentRuntime = this.getCarouselRuntime();
                if (!currentRuntime.enabled || !this.instance) {
                    this.stopCarousel(true);
                    return;
                }
                this.runCarouselCycle(currentRuntime);
            });
        }, runtime.durationMs + runtime.pauseMs);
    }

    async create(container: HTMLElement, config: BaseTableComponentProps, bpExecutor: BPExecutor, index?: number): Promise<void> {
        const normalizedConfig = normalizeBaseTableConfig(config);
        await super.create(container, normalizedConfig, bpExecutor, index);
        this.instance = await ComponentUtil.createAndRender<BaseTableComponentRef>(container, BaseTableComponent, normalizedConfig);
        if (!this.instance || this.container !== container) return;
        this.initialized = true;
        this.refreshCarouselRuntime();
    }

    destroy(): void {
        this.stopCarousel(false);
        this.instance?.destroy();
        this.instance = null;
        this.config = null;
        this.initialized = false;
        super.destroy();
    }

    getConfig(): BaseTableComponentProps | null {
        if (this.config?.style)
            this.config.style = normalizeBaseTableStyle(this.config.style);
        return this.config;
    }

    changeData(data: any) {
        this.config = normalizeBaseTableConfig(ObjectUtil.merge(this.config, {style: {data}, data: {value: data}}));
        this.instance?.updateConfig(this.config!);
        this.refreshCarouselRuntime();
    }

    update(config: BaseTableComponentProps, upOp?: UpdateOptions | undefined): void {
        this.config = normalizeBaseTableConfig(ObjectUtil.merge(this.config, config));
        upOp = upOp || {reRender: true};
        if (upOp.reRender) {
            this.instance?.updateConfig(this.config!);
            this.refreshCarouselRuntime();
        }
    }


    setVisible(visible: boolean) {
        this.isVisible = visible;
        this.instance?.changeVisible(visible);
        if (!visible)
            this.stopCarousel(true);
        else
            this.refreshCarouselRuntime();
    }

    updateTheme(newTheme: IThemeItem) {
        if (!newTheme) return;
        const styleConfig = this.config?.style ?? {};
        const {colors: {main, background, mainText, subText, supplementSecond, supplementFirst}} = newTheme;
        if (styleConfig?.header?.background)
            styleConfig.header.background = main;
        if (styleConfig?.header?.color)
            styleConfig.header.color = mainText;
        if (styleConfig?.body?.background)
            styleConfig.body.background = background;
        if (styleConfig?.body?.color)
            styleConfig.body.color = subText;
        if (styleConfig?.body?.lineBackground)
            styleConfig.body.lineBackground = [supplementFirst!, supplementSecond!];
        //重新渲染
        this.update({style: styleConfig} as BaseTableComponentProps, {reRender: true});
    }
}
