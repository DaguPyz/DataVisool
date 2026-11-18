/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import {createElement, type ComponentType} from 'react';
import type {IFilterConfigType} from './types';
import type AbstractDesignerController from './core/AbstractDesignerController';

export interface ConfigPanelProps {
    controller: AbstractDesignerController;
}

export interface FilterConfigProps {
    controller?: AbstractDesignerController;
    config?: IFilterConfigType;
    onChange?: (config: IFilterConfigType) => void;
}

export interface HostConfigPanels {
    AnimationConfig: ComponentType<ConfigPanelProps>;
    ThemeConfig: ComponentType<ConfigPanelProps>;
    BaseInfo: ComponentType<ConfigPanelProps>;
    DataConfig: ComponentType<ConfigPanelProps>;
    FilterConfig: ComponentType<FilterConfigProps>;
}

let panels: HostConfigPanels | undefined;

/** Called by the editor host, never by component packages. */
export function registerHostConfigPanels(value: HostConfigPanels): void {
    panels = value;
}

function getPanel<K extends keyof HostConfigPanels>(key: K): HostConfigPanels[K] {
    if (!panels) throw new Error(`Configuration panel ${key} requires the editor host.`);
    return panels[key];
}

export const AnimationConfig = (props: ConfigPanelProps) => createElement(getPanel('AnimationConfig'), props);
export const ThemeConfig = (props: ConfigPanelProps) => createElement(getPanel('ThemeConfig'), props);
export const BaseInfo = (props: ConfigPanelProps) => createElement(getPanel('BaseInfo'), props);
export const DataConfig = (props: ConfigPanelProps) => createElement(getPanel('DataConfig'), props);
export const FilterConfig = (props: FilterConfigProps) => createElement(getPanel('FilterConfig'), props);
