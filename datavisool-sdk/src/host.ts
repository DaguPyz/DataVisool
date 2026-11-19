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

type HostConfigPanel = HostConfigPanels[keyof HostConfigPanels];

interface HostConfigPanelRegistration {
    readonly token: symbol;
    readonly component: HostConfigPanel;
}

const panelRegistrations = new Map<keyof HostConfigPanels, HostConfigPanelRegistration[]>();

/** Register one host panel. The returned disposer removes only this registration. */
export function registerHostConfigPanel<K extends keyof HostConfigPanels>(
    key: K,
    component: HostConfigPanels[K],
): () => void {
    const registration: HostConfigPanelRegistration = {token: Symbol(key), component};
    const stack = panelRegistrations.get(key) ?? [];
    stack.push(registration);
    panelRegistrations.set(key, stack);

    let registered = true;
    return () => {
        if (!registered) return;
        registered = false;
        const current = panelRegistrations.get(key);
        if (!current) return;
        const index = current.findIndex(item => item.token === registration.token);
        if (index !== -1) current.splice(index, 1);
        if (current.length === 0) panelRegistrations.delete(key);
    };
}

/** Called by the editor host, never by component packages. */
export function registerHostConfigPanels(value: Partial<HostConfigPanels>): () => void {
    const unregister: Array<() => void> = [];
    try {
        for (const key of Object.keys(value) as (keyof HostConfigPanels)[]) {
            const component = value[key];
            if (component) unregister.push(registerHostConfigPanel(key, component as HostConfigPanels[typeof key]));
        }
    } catch (error) {
        unregister.reverse().forEach(dispose => dispose());
        throw error;
    }

    let registered = true;
    return () => {
        if (!registered) return;
        registered = false;
        unregister.slice().reverse().forEach(dispose => dispose());
    };
}

function getPanel<K extends keyof HostConfigPanels>(key: K): HostConfigPanels[K] {
    const stack = panelRegistrations.get(key);
    const component = stack?.[stack.length - 1]?.component;
    if (!component) throw new Error(`Configuration panel ${key} requires the editor host.`);
    return component as HostConfigPanels[K];
}

export const AnimationConfig = (props: ConfigPanelProps) => createElement(getPanel('AnimationConfig'), props);
export const ThemeConfig = (props: ConfigPanelProps) => createElement(getPanel('ThemeConfig'), props);
export const BaseInfo = (props: ConfigPanelProps) => createElement(getPanel('BaseInfo'), props);
export const DataConfig = (props: ConfigPanelProps) => createElement(getPanel('DataConfig'), props);
export const FilterConfig = (props: FilterConfigProps) => createElement(getPanel('FilterConfig'), props);
