/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {afterEach, describe, expect, it, vi} from 'vitest';
import {AbstractDesignerDefinition as SdkDefinition, AbstractDesignerController as SdkController} from '@datavisool/sdk/core';
import * as SdkCore from '@datavisool/sdk/core';
import * as SdkUtils from '@datavisool/sdk/utils';
import * as SdkReact from '@datavisool/sdk/react';
import * as SdkHost from '@datavisool/sdk/host';
import * as SdkTypes from '@datavisool/sdk/types';
import * as UiRoot from '@datavisool/ui';
import * as UiBasic from '@datavisool/ui/basic';
import * as UiSchema from '@datavisool/ui/schema';
import * as UiCodeEditor from '@datavisool/ui/code-editor';
import * as UiFeedback from '@datavisool/ui/feedback';
import {exportComponentRuntime} from '@/global/ComponentRuntime';

describe('shared component runtime', () => {
    afterEach(() => {
        delete (window as any).DataVisoolSDK;
        delete (window as any).DataVisoolTypes;
        delete (window as any).DataVisoolUI;
    });

    it('exposes the shared SDK, UI and the Web host controller to components', () => {
        exportComponentRuntime();
        expect(window.DataVisoolSDK.AbstractDesignerController.prototype).toBeInstanceOf(SdkController);
        expect(window.DataVisoolSDK.AbstractDesignerDefinition.prototype).toBeInstanceOf(SdkDefinition);
        expect(window.DataVisoolSDK.ComponentUtil.createAndRender).toBeTypeOf('function');
        expect(window.DataVisoolUI.DatavisoolGUI).toBeTypeOf('function');
        expect(window.ReactDOM.createRoot).toBeTypeOf('function');
        expect((window as any).LightChaserInterface).toBeUndefined();
        expect((window as any).LightChaserUtil).toBeUndefined();
    });

    it('supports a component built against the shared runtime', async () => {
        exportComponentRuntime();
        class ExampleController extends window.DataVisoolSDK.AbstractDesignerController {
            update(config: any) { this.config = config; }
            getConfig() { return this.config; }
        }
        class ExampleDefinition extends window.DataVisoolSDK.AbstractDesignerDefinition {
            getBaseInfo() { return {compKey: 'example', compName: 'Example'}; }
            getInitConfig() { return {base: {id: 'example-1'}}; }
            getController() { return ExampleController; }
            getChartImg() { return null; }
        }
        const definition = new ExampleDefinition();
        const controller = new (definition.getController())();
        const container = document.createElement('div');
        const executor = new window.DataVisoolSDK.BPExecutor({} as any);
        await controller.create(container, definition.getInitConfig(), executor);
        expect(controller.getConfig()).toEqual({base: {id: 'example-1'}});
        expect(definition.getMenuList().map(item => item.key)).toEqual(['style', 'data']);
        expect(definition.getAiFeatureInfo().compKey).toBe('example');
        controller.destroy();
        expect(controller.getConfig()).toBeNull();
    });

    it('preserves the Web definition default menus and blueprint actions', () => {
        exportComponentRuntime();
        const definition = new (class extends window.DataVisoolSDK.AbstractDesignerDefinition {
            getBaseInfo() { return {compKey: 'example', compName: 'Example'}; }
            getInitConfig() { return {}; }
            getController() { return null; }
            getChartImg() { return null; }
        })();
        expect(definition.getMenuList().map(item => item.key)).toEqual(['style', 'data']);
        const actions = definition.getActionList();
        expect(actions.map(item => item.id)).toEqual(['show', 'hide', 'updateConfig', 'updateData', 'toggleStatus']);
        const controller: any = {
            setVisible: vi.fn(), update: vi.fn(), changeData: vi.fn(),
            config: {status: {selected: {config: {style: {opacity: 0.5}}}}},
        };
        actions[0].handler(controller);
        actions[1].handler(controller);
        actions[2].handler(controller, {style: {color: 'red'}});
        actions[3].handler(controller, {value: 42});
        actions[4].handler(controller, 'selected');
        actions[4].handler(controller, 'missing');
        expect(controller.setVisible.mock.calls).toEqual([[true], [false]]);
        expect(controller.update.mock.calls).toEqual([[{style: {color: 'red'}}], [{style: {opacity: 0.5}}]]);
        expect(controller.changeData).toHaveBeenCalledOnce();
        expect(controller.changeData).toHaveBeenCalledWith({value: 42});
    });

    it('retains Web AI metadata for a component using the shared definition', () => {
        exportComponentRuntime();
        const definition = new (class extends window.DataVisoolSDK.AbstractDesignerDefinition {
            getBaseInfo() { return {compKey: 'example', compName: ' 示例 ', categorize: '图表', source: '内置'}; }
            getInitConfig() { return {}; }
            getController() { return null; }
            getChartImg() { return null; }
        })();
        const info = definition.getAiFeatureInfo();
        expect(info.compKey).toBe('example');
        expect(info.summary).toBe(' 示例 组件。');
        expect(info.featureTags).toEqual(['示例', '图表', '内置', '样式', '数据']);
        expect(info.capabilities).toEqual(['显示', '隐藏', '更新组件样式', '更新组件数据', '切换状态', '组件加载完成时']);
        expect(info.applicableScenes).toEqual([]);
        expect(info.aliases).toEqual([]);
        expect(definition.getAiStylePromptTs()).toBe('');
    });

    it('exposes every CLI external subentry without replacing unrelated exports', () => {
        exportComponentRuntime();
        const hostOverrides = new Set(['AbstractDesignerController', 'AbstractDesignerDefinition', 'AbstractDefinition', 'BPExecutor', 'ComponentUtil']);
        for (const sdk of [SdkCore, SdkUtils, SdkReact, SdkHost]) {
            for (const [name, value] of Object.entries(sdk)) {
                expect(window.DataVisoolSDK, `missing SDK export ${name}`).toHaveProperty(name);
                if (!hostOverrides.has(name)) expect((window.DataVisoolSDK as any)[name], name).toBe(value);
            }
        }
        for (const ui of [UiRoot, UiBasic, UiSchema, UiCodeEditor, UiFeedback]) {
            for (const [name, value] of Object.entries(ui)) {
                expect((window.DataVisoolUI as any)[name], `UI export ${name}`).toBe(value);
            }
        }
        for (const [name, value] of Object.entries(SdkTypes)) {
            expect((window.DataVisoolTypes as any)[name], `types export ${name}`).toBe(value);
        }
    });
});
