/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {
    LayerFilterCompareCondition,
    LayerFilterCondition,
    LayerFilterExistsCondition,
    LayerFilterGeometryCondition,
    LayerFilterGroupConfig,
    LayerFilterInCondition,
} from '@datavisool/sdk/types';

/**
 * 图层过滤器编译器
 *
 * 输入：结构化的 filterConfig（由 LayerEditorDrawer 生成）
 * 输出：MapLibre Style Spec 的 filter 表达式（可直接赋给 layer.filter）
 *
 * 设计目标：
 * - 让 UI 以“条件块”的形式编辑过滤逻辑
 * - 保存时统一编译为 MapLibre 可执行的表达式数组
 */
const compileGeometry = (c: LayerFilterGeometryCondition) => {
    return ['==', ['geometry-type'], c.geometryType];
};

const compileCompare = (c: LayerFilterCompareCondition) => {
    const opMap: Record<LayerFilterCompareCondition['op'], string> = {
        eq: '==',
        neq: '!=',
        gt: '>',
        gte: '>=',
        lt: '<',
        lte: '<=',
    };
    return [opMap[c.op], ['get', c.key], c.value];
};

const compileExists = (c: LayerFilterExistsCondition) => {
    if (c.exists)
        return ['has', c.key];
    return ['!has', c.key];
};

const compileIn = (c: LayerFilterInCondition) => {
    const base = ['in', ['get', c.key], ['literal', c.values]];
    if (c.not)
        return ['!', base];
    return base;
};

/**
 * 编译单条条件。
 * - geometry：按 geometry-type 过滤
 * - compare：按属性比较（==, !=, >, >=, <, <=）
 * - exists：按属性存在性（has/!has）
 * - in：按属性是否属于 values（可取反）
 */
export const compileFilterCondition = (c: LayerFilterCondition) => {
    if (c.kind === 'geometry')
        return compileGeometry(c);
    if (c.kind === 'compare')
        return compileCompare(c);
    if (c.kind === 'exists')
        return compileExists(c);
    return compileIn(c);
};

/**
 * 编译一组条件（all/any/none）。
 * - all：['all', ...]
 * - any：['any', ...]
 * - none：['!', ['any', ...]]
 *
 * 空配置返回 undefined（表示不设置 filter）
 */
export const compileLayerFilter = (cfg?: LayerFilterGroupConfig): any | undefined => {
    if (!cfg || !Array.isArray(cfg.items) || cfg.items.length === 0)
        return undefined;
    const compiled = cfg.items
        .filter(Boolean)
        .map(compileFilterCondition)
        .filter(Boolean);
    if (compiled.length === 0)
        return undefined;
    if (cfg.op === 'all')
        return ['all', ...compiled];
    if (cfg.op === 'any')
        return ['any', ...compiled];
    return ['!', ['any', ...compiled]];
};
