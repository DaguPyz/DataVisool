/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import React, {Suspense} from 'react';
import {fireEvent, render, waitFor} from '@testing-library/react';
import {afterAll, afterEach, beforeAll, describe, expect, it, vi} from 'vitest';

const definitions = import.meta.glob('/src/comps/**/*Definition.ts');
const definitionSources = import.meta.glob('/src/comps/**/*Definition.ts', {query: '?raw', import: 'default', eager: true}) as Record<string, string>;
const configSources = import.meta.glob('/src/comps/**/*Config.tsx', {query: '?raw', import: 'default', eager: true}) as Record<string, string>;
const guiDirectories = new Set(Object.entries(configSources)
    .filter(([, source]) => /\bDatavisoolGUI\b/.test(source))
    .map(([path]) => path.slice(0, path.lastIndexOf('/'))));
const cases = Object.entries(definitions).filter(([path]) =>
    !/\/Abstract[^/]+Definition\.ts$/.test(path) &&
    (guiDirectories.has(path.slice(0, path.lastIndexOf('/'))) ||
        /extends Abstract(?:Area|Bar|Column|Line|Rose|Scatter)Definition/.test(definitionSources[path])));

describe('shared GUI component settings with default configurations', () => {
    const previousEnvironment = window.DATAVISOOL_ENV;
    const originalBoundingRect = Object.getOwnPropertyDescriptor(Range.prototype, 'getBoundingClientRect');
    const originalClientRects = Object.getOwnPropertyDescriptor(Range.prototype, 'getClientRects');
    const renderOnly: string[] = [];
    beforeAll(() => {
        if (!Range.prototype.getBoundingClientRect) {
            Object.defineProperty(Range.prototype, 'getBoundingClientRect', {configurable: true, value: () => new DOMRect()});
        }
        if (!Range.prototype.getClientRects) {
            Object.defineProperty(Range.prototype, 'getClientRects', {configurable: true, value: () => []});
        }
        vi.stubGlobal('Worker', class { postMessage() {} terminate() {} });
        vi.stubGlobal('URL', class extends URL {
            static createObjectURL() { return 'blob:gui-test'; }
            static revokeObjectURL() {}
        });
    });
    afterEach(() => { window.DATAVISOOL_ENV = previousEnvironment; });
    afterAll(() => {
        console.info(`GUI panels rendered: ${cases.length}; basic interaction checked: ${cases.length - renderOnly.length}; render only: ${renderOnly.join(', ')}`);
        if (!originalBoundingRect) delete (Range.prototype as Partial<Range>).getBoundingClientRect;
        if (!originalClientRects) delete (Range.prototype as Partial<Range>).getClientRects;
        vi.unstubAllGlobals();
    });

    it.each(cases)('%s renders its style panel', async (_path, load) => {
        window.DATAVISOOL_ENV = {fonts: [], currentManager: {layerManager: {layerConfigs: {}}}} as never;
        const module = await load() as {default: new () => any};
        const definition = new module.default();
        const config = definition.getInitConfig();
        const controller = {getConfig: () => config, update: vi.fn()};
        const mapping = definition.getMenuToConfigContentMap();
        const Panel = (mapping.style ?? mapping.custom ?? mapping.config) as React.ComponentType<any>;
        expect(Panel).toBeTruthy();
        const {container} = render(<Suspense fallback={<span>加载中</span>}><Panel controller={controller}/></Suspense>);
        await waitFor(() => expect(container.textContent).not.toContain('加载中'));
        expect(container.textContent?.trim().length).toBeGreaterThan(0);
        const findField = () => Array.from(container.querySelectorAll<HTMLInputElement>('input:not([type=hidden]):not([readonly]):not([disabled]):not([type=checkbox]):not([type=radio]), textarea:not([readonly]):not([disabled])'))
            .find(element => !element.closest('.CodeMirror'));
        let field = findField();
        for (let attempt = 0; attempt < 20 && !field; attempt++) {
            const toggle = container.querySelector<HTMLElement>('button[aria-expanded="false"]');
            if (!toggle) break;
            fireEvent.click(toggle);
            field = findField();
        }
        if (field) {
            const min = field.min === '' ? 0 : Number(field.min);
            const max = field.max === '' ? min + 10 : Number(field.max);
            const numericValue = Number(field.value) === min ? max : min;
            const value = field.type === 'number' ? String(numericValue) : 'DataVisool test';
            fireEvent.change(field, {target: {value}});
            fireEvent.blur(field);
            await waitFor(() => expect(controller.update).toHaveBeenCalled(), {timeout: 300});
        } else {
            const toggle = container.querySelector<HTMLElement>('button[role="switch"]');
            const editor = container.querySelector<HTMLElement>('.CodeMirror') as (HTMLElement & {CodeMirror?: {setValue(value: string): void}}) | null;
            const refresh = Array.from(container.querySelectorAll('button')).find(button => button.textContent?.includes('刷新图表'));
            if (toggle) {
                fireEvent.click(toggle);
                expect(controller.update).toHaveBeenCalled();
            } else if (editor?.CodeMirror && refresh) {
                editor.CodeMirror.setValue('const option = {};');
                fireEvent.click(refresh);
                expect(controller.update).toHaveBeenCalledWith({style: {customCode: 'const option = {};'}});
            } else renderOnly.push(_path);
        }
    }, 15000);
});
