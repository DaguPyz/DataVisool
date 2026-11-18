/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import type {ComponentBaseProps, DataConfigType, IFilterConfigType, IThemeItem} from '../types';
import AbstractController from './AbstractController';
import type BPExecutor from './BPExecutor';

export interface ComponentDataUpdater {
    run(config: DataConfigType, singleTrigger?: boolean): void;
    destroy(): void;
}

/** Shared lifecycle; data access is implemented by the host's subclass. */
export default abstract class AbstractDesignerController<I = any, C = any> extends AbstractController<I, C> {
    protected lastReqState = true;
    public bpExecutor: BPExecutor | null = null;
    public componentDataUpdater: ComponentDataUpdater | null = null;
    public index?: number;

    public async create(container: HTMLElement, config: C, bpExecutor: BPExecutor, index?: number): Promise<void> {
        this.index = index;
        this.config = config;
        this.container = container;
        this.bpExecutor = bpExecutor;
    }

    /** Optional extension hooks for components that support data, events or themes. */
    public changeData(_data: any): void {}
    public registerEvent(): void {}
    public updateTheme(_newTheme: IThemeItem): void {}

    public loadComponentData(): void {
        throw new Error('Component data loading requires the host runtime. Build remote components with datavisool-cli.');
    }

    public updateFilter(filter: IFilterConfigType): void {
        if (this.config && (this.config as ComponentBaseProps).filter)
            (this.config as ComponentBaseProps).filter = filter;
        if (!this.container) return;
        this.container.style.filter = filter?.enable
            ? `blur(${filter.blur}px) brightness(${filter.brightness}) contrast(${filter.contrast}) opacity(${filter.opacity}) saturate(${filter.saturate}) hue-rotate(${filter.hueRotate}deg)`
            : 'none';
    }

    public setVisible(visible: boolean): void {
        if (this.container) this.container.style.visibility = visible ? 'visible' : 'hidden';
    }

    public override destroy(): void {
        this.componentDataUpdater?.destroy();
        this.componentDataUpdater = null;
        this.bpExecutor = null;
        super.destroy();
    }
}
