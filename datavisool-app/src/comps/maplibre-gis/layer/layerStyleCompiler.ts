/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {LayerStyleConfig, LayerStyleValueConfig} from '@datavisool/sdk/types';

/**
 * 图层样式编译器
 *
 * 输入：结构化的 styleConfig（由 LayerEditorDrawer 生成）
 * 输出：MapLibre Style Spec 的 paint/layout 对象（字段值可能是 expression）
 *
 * 支持的表达式模式：
 * - const：常量
 * - prop_get：['get', property]
 * - prop_match：['match', ['get', property], input1, value1, ..., defaultValue]
 * - prop_interpolate：['interpolate', ['linear'], ['get', property], stop1, value1, ...]
 * - zoom_step：['step', ['zoom'], defaultValue, stop1, value1, ...]
 * - zoom_interpolate：['interpolate', ['linear'], ['zoom'], stop1, value1, ...]
 */
export const compileStyleValue = (cfg: LayerStyleValueConfig): any => {
    if (cfg.mode === 'const')
        return (cfg as any).value;
    if (cfg.mode === 'prop_get')
        return ['get', (cfg as any).property];
    if (cfg.mode === 'prop_match') {
        const c: any = cfg;
        const parts: any[] = ['match', ['get', c.property]];
        (c.cases ?? []).forEach((it: any) => {
            parts.push(it.input);
            parts.push(it.value);
        });
        parts.push(c.defaultValue);
        return parts;
    }
    if (cfg.mode === 'prop_interpolate') {
        const c: any = cfg;
        const parts: any[] = ['interpolate', ['linear'], ['get', c.property]];
        (c.stops ?? []).forEach((it: any) => {
            parts.push(it.input);
            parts.push(it.value);
        });
        return parts;
    }
    if (cfg.mode === 'zoom_step') {
        const c: any = cfg;
        const parts: any[] = ['step', ['zoom'], c.defaultValue];
        (c.stops ?? []).forEach((it: any) => {
            parts.push(it.input);
            parts.push(it.value);
        });
        return parts;
    }
    const c: any = cfg;
    const parts: any[] = ['interpolate', ['linear'], ['zoom']];
    (c.stops ?? []).forEach((it: any) => {
        parts.push(it.input);
        parts.push(it.value);
    });
    return parts;
};

/**
 * 将 styleConfig 的 paint/layout 字典批量编译。
 * - 仅输出有值的字段
 * - 若 paint/layout 为空则返回 undefined，便于上层 merge 时跳过
 */
export const compileLayerStyle = (cfg?: LayerStyleConfig): {paint?: Record<string, any>; layout?: Record<string, any>} => {
    const paint: Record<string, any> = {};
    const layout: Record<string, any> = {};

    if (cfg?.paint) {
        Object.entries(cfg.paint).forEach(([k, v]) => {
            if (!v)
                return;
            paint[k] = compileStyleValue(v);
        });
    }

    if (cfg?.layout) {
        Object.entries(cfg.layout).forEach(([k, v]) => {
            if (!v)
                return;
            layout[k] = compileStyleValue(v);
        });
    }

    return {
        paint: Object.keys(paint).length > 0 ? paint : undefined,
        layout: Object.keys(layout).length > 0 ? layout : undefined,
    };
};
