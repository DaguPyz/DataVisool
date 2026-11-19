/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {act, waitFor} from '@testing-library/react';
import {Component, createElement} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import AbstractDesignerController from '@/framework/core/AbstractDesignerController';
import BPExecutor from '@/plugins/designer-runtime/internal/designer/blueprint/core/BPExecutor';
import {BaseButtonController} from '@/comps/builtin/base-button/BaseButtonController';
import AntdPieController from '@/comps/antd/pie/AntdPieController';
import {BaseTextController} from '@/comps/builtin/base-text/BaseTextController';
import ComponentUtil from '@/util/ComponentUtil';
import {URLUtil} from '@datavisool/sdk';

vi.mock('@antv/g2plot', () => ({Pie: class {}, StatisticText: {}}));

const updaters = vi.hoisted(() => ({failOnRun: false, instances: [] as Array<{
    success: (value: unknown) => void;
    failure: () => void;
    run: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
}>}));

class HostController extends AbstractDesignerController<unknown, any> {
    changeData = vi.fn();
    update(config: any) { this.config = config; }
    getConfig() { return this.config; }
}

function installUpdaterFactory(controller: AbstractDesignerController<any, any>) {
    controller.setRuntimeDataAdapter({
        createUpdater(success, failure) {
            const updater = {
                success,
                failure,
                run: vi.fn(() => { if (updaters.failOnRun) throw new Error('synthetic data load failure'); }),
                destroy: vi.fn(),
            };
            updaters.instances.push(updater);
            return updater;
        },
        isLayerHidden(id) {
            return Boolean(window.DATAVISOOL_ENV?.currentManager?.layerManager?.layerConfigs?.[id]?.hide);
        },
    });
}

describe('shared SDK Web host controller', () => {
    const originalEnv = window.DATAVISOOL_ENV;
    beforeEach(() => {
        updaters.instances.length = 0;
        updaters.failOnRun = false;
        window.DATAVISOOL_ENV = {currentManager: {layerManager: {layerConfigs: {}}}} as any;
    });
    afterEach(() => { window.DATAVISOOL_ENV = originalEnv; });

    it('loads Web data and clears a failure message after recovery', async () => {
        const controller = new HostController();
        const container = document.createElement('div');
        const data = {sourceType: 'static', value: [1]};
        await controller.create(container, {base: {id: 'component'}, data}, new BPExecutor({} as any));
        installUpdaterFactory(controller);
        controller.loadComponentData();
        await waitFor(() => expect(updaters.instances).toHaveLength(1));
        const updater = updaters.instances[0];
        expect(updater.run).toHaveBeenCalledWith(data, undefined);
        updater.failure();
        expect(container.querySelector('.view-error-message')).not.toBeNull();
        updater.success([2]);
        expect(controller.changeData).toHaveBeenCalledWith([2]);
        expect(container.querySelector('.view-error-message')).toBeNull();
        controller.destroy();
        expect(updater.destroy).toHaveBeenCalledOnce();
    });

    it('shows data failures for visible layers but not hidden layers', async () => {
        const layerConfigs = window.DATAVISOOL_ENV.currentManager.layerManager.layerConfigs;
        layerConfigs.visible = {id: 'visible', hide: false} as any;
        layerConfigs.hidden = {id: 'hidden', hide: true} as any;
        const visible = new HostController();
        const hidden = new HostController();
        const visibleContainer = document.createElement('div');
        const hiddenContainer = document.createElement('div');
        const executor = new BPExecutor({} as any);
        await visible.create(visibleContainer, {base: {id: 'visible'}, data: {}}, executor);
        await hidden.create(hiddenContainer, {base: {id: 'hidden'}, data: {}}, executor);
        installUpdaterFactory(visible);
        installUpdaterFactory(hidden);
        visible.loadComponentData();
        await waitFor(() => expect(updaters.instances).toHaveLength(1));
        hidden.loadComponentData();
        await waitFor(() => expect(updaters.instances).toHaveLength(2));
        updaters.instances[0].failure();
        updaters.instances[1].failure();
        expect(visibleContainer.querySelector('.view-error-message')).not.toBeNull();
        expect(hiddenContainer.querySelector('.view-error-message')).toBeNull();
        updaters.instances[0].success('recovered');
        expect(visibleContainer.querySelector('.view-error-message')).toBeNull();
        visible.destroy();
        hidden.destroy();
    });

    it('reports a failed request through an injected host even when the legacy manager is unavailable', async () => {
        window.DATAVISOOL_ENV = {} as any;
        const controller = new HostController();
        const container = document.createElement('div');
        await controller.create(container, {base: {id: 'component'}, data: {}}, new BPExecutor({} as any));
        installUpdaterFactory(controller);
        controller.loadComponentData();
        await waitFor(() => expect(updaters.instances).toHaveLength(1));
        expect(() => updaters.instances[0].failure()).not.toThrow();
        expect(container.querySelector('.view-error-message')).not.toBeNull();
        updaters.instances[0].success('recovered');
        expect(container.querySelector('.view-error-message')).toBeNull();
        controller.destroy();
    });

    it('reports a data updater initialization failure', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        updaters.failOnRun = true;
        const controller = new HostController();
        const container = document.createElement('div');
        await controller.create(container, {base: {id: 'component'}, data: {}}, new BPExecutor({} as any));
        installUpdaterFactory(controller);
        controller.loadComponentData();
        await waitFor(() => expect(container.querySelector('.view-error-message')).not.toBeNull());
        expect(updaters.instances[0].destroy).toHaveBeenCalledOnce();
        controller.destroy();
        expect(updaters.instances[0].destroy).toHaveBeenCalledOnce();
    });

    it('destroys a synchronously created updater and ignores its callbacks after controller teardown', async () => {
        const controller = new HostController();
        await controller.create(document.createElement('div'), {data: {sourceType: 'static'}}, new BPExecutor({} as any));
        installUpdaterFactory(controller);
        controller.loadComponentData();
        expect(updaters.instances).toHaveLength(1);
        const updater = updaters.instances[0];
        controller.destroy();
        expect(updater.destroy).toHaveBeenCalledOnce();
        updater.success('late');
        updater.failure();
        expect(controller.changeData).not.toHaveBeenCalled();
    });

    it('cleans up a built-in controller and ignores a replaced updater callback', async () => {
        const controller = new BaseButtonController();
        controller.container = document.createElement('div');
        controller.config = {data: {sourceType: 'static'}};
        installUpdaterFactory(controller);
        controller.loadComponentData();
        const first = updaters.instances[0];
        controller.loadComponentData();
        expect(first.destroy).toHaveBeenCalledOnce();
        first.success('stale');
        first.failure();
        expect((controller as any).config).toEqual({data: {sourceType: 'static'}});
        expect(updaters.instances).toHaveLength(2);
        controller.destroy();
        expect(updaters.instances[1].destroy).toHaveBeenCalledOnce();
        expect(controller.container).toBeNull();
        expect(controller.config).toBeNull();
    });

    it('removes a built-in controller failure indicator on destruction', async () => {
        const controller = new BaseButtonController();
        const container = document.createElement('div');
        controller.container = container;
        controller.config = {base: {id: 'button'}, data: {sourceType: 'static'}};
        installUpdaterFactory(controller);
        controller.loadComponentData();
        await waitFor(() => expect(updaters.instances).toHaveLength(1));
        updaters.instances[0].failure();
        expect(container.querySelector('.view-error-message')).not.toBeNull();
        controller.destroy();
        expect(updaters.instances[0].destroy).toHaveBeenCalledOnce();
        expect(container.querySelector('.view-error-message')).toBeNull();
    });

    it('stops text initialization if rendering is cancelled after destruction', async () => {
        let finish!: (value: null) => void;
        const render = vi.spyOn(ComponentUtil, 'createAndRender').mockReturnValue(new Promise(resolve => { finish = resolve; }));
        vi.spyOn(URLUtil, 'parseUrlParams').mockReturnValue({mode: '0'});
        const controller = new BaseTextController();
        const creation = controller.create(document.createElement('div'), {base: {id: 'text'}} as any, new BPExecutor({} as any));
        await waitFor(() => expect(render).toHaveBeenCalledOnce());
        controller.destroy();
        finish(null);
        await expect(creation).resolves.toBeUndefined();
        expect(controller.container).toBeNull();
        vi.restoreAllMocks();
    });

    it('unmounts a shared React component when its host controller is destroyed', async () => {
        const onUnmount = vi.fn();
        class Template extends Component {
            componentWillUnmount() { onUnmount(); }
            render() { return createElement('span', null, 'component'); }
        }
        const controller = new HostController();
        const container = document.createElement('div');
        await controller.create(container, {data: {}}, new BPExecutor({} as any));
        await act(async () => { ComponentUtil.createAndRender(container, Template as never); });
        expect(container.textContent).toBe('component');
        await act(async () => { controller.destroy(); });
        expect(onUnmount).toHaveBeenCalledOnce();
        expect(container.textContent).toBe('');
    });

    it('cleans up a chart safely before its instance exists and when destroyed twice', async () => {
        const controller = new AntdPieController();
        controller.container = document.createElement('div');
        controller.config = {data: {sourceType: 'static'}};
        installUpdaterFactory(controller);
        controller.loadComponentData();
        expect(() => controller.destroy()).not.toThrow();
        expect(controller.container).toBeNull();
        expect(updaters.instances).toHaveLength(1);
        expect(updaters.instances[0].destroy).toHaveBeenCalledOnce();
        expect(() => controller.destroy()).not.toThrow();
    });

    it('stops chart data loading even if the chart instance fails to destroy', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const controller = new AntdPieController();
        controller.container = document.createElement('div');
        controller.config = {data: {sourceType: 'static'}};
        (controller as any).instance = {destroy: () => { throw new Error('chart cleanup failed'); }};
        installUpdaterFactory(controller);
        controller.loadComponentData();
        await waitFor(() => expect(updaters.instances).toHaveLength(1));
        expect(() => controller.destroy()).not.toThrow();
        expect(updaters.instances[0].destroy).toHaveBeenCalledOnce();
        expect(controller.container).toBeNull();
        expect(controller.config).toBeNull();
        vi.restoreAllMocks();
    });

    it('preserves controller visibility, filters and lifecycle through the shared SDK', async () => {
        const controller = new HostController();
        const container = document.createElement('div');
        const config = {filter: {enable: false}, data: {sourceType: 'static'}};
        const executor = new BPExecutor({} as any);
        await controller.create(container, config, executor, 2);
        installUpdaterFactory(controller);
        expect(controller.container).toBe(container);
        expect(controller.config).toBe(config);
        expect(controller.bpExecutor).toBe(executor);
        expect(controller.index).toBe(2);

        controller.setVisible(false);
        expect(container.style.visibility).toBe('hidden');
        controller.setVisible(true);
        expect(container.style.visibility).toBe('visible');
        const filter = {enable: true, blur: 2, brightness: 1, contrast: 1, opacity: 0.5, saturate: 1, hueRotate: 45};
        controller.updateFilter(filter);
        expect(config.filter).toBe(filter);
        expect(container.style.filter).toContain('blur(2px)');
        controller.updateFilter({...filter, enable: false});
        expect(container.style.filter).toBe('none');

        controller.destroy();
        expect(controller.container).toBeNull();
        expect(controller.config).toBeNull();
        expect(controller.bpExecutor).toBeNull();
    });

    it('replaces the existing updater when data loading restarts', async () => {
        const controller = new HostController();
        const container = document.createElement('div');
        await controller.create(container, {data: {sourceType: 'static'}}, new BPExecutor({} as any));
        installUpdaterFactory(controller);
        controller.loadComponentData();
        await waitFor(() => expect(updaters.instances).toHaveLength(1));
        controller.loadComponentData();
        expect(updaters.instances[0].destroy).toHaveBeenCalledOnce();
        updaters.instances[0].success('stale');
        updaters.instances[0].failure();
        expect(controller.changeData).not.toHaveBeenCalled();
        expect(container.querySelector('.view-error-message')).toBeNull();
        await waitFor(() => expect(updaters.instances).toHaveLength(2));
        controller.destroy();
        expect(updaters.instances[1].destroy).toHaveBeenCalledOnce();
        updaters.instances[1].success('destroyed');
        updaters.instances[1].failure();
        expect(controller.changeData).not.toHaveBeenCalled();
        expect(container.querySelector('.view-error-message')).toBeNull();
    });
});
