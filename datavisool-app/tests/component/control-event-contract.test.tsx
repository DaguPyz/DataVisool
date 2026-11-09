/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import React, {createRef} from 'react';
import {act, fireEvent, render} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';

const componentUtilState = vi.hoisted(() => ({
    props: null as any,
    instance: {setEventHandler: vi.fn(), updateConfig: vi.fn(), setValue: vi.fn(), changeVisible: vi.fn()},
}));
vi.mock('@/util/ComponentUtil.ts', () => ({default: {
    createAndRender: vi.fn(async (_container: any, _component: any, props: any) => {
        componentUtilState.props = props;
        return componentUtilState.instance;
    }),
}}));
vi.mock('@datavisool/sdk/react', () => ({ComponentUtil: {
    createAndRender: vi.fn(async (_container: any, _component: any, props: any) => {
        componentUtilState.props = props;
        return componentUtilState.instance;
    }),
}}));

vi.mock('@datavisool/ui', async () => {
    const ReactModule = await import('react');
    return {
        Select: ({options = [], onChange}: any) => ReactModule.createElement('select', {
            'aria-label': 'select',
            onChange: (event: any) => onChange(event.target.value),
        }, options.map((option: any) => ReactModule.createElement('option', {
            key: String(option.value), value: String(option.value),
        }, option.label ?? option.value))),
        Switch: ({value, onChange, disabled}: any) => ReactModule.createElement('button', {
            type: 'button', 'aria-label': 'switch', disabled, onClick: () => onChange(!value),
        }, 'toggle'),
    };
});

import {BaseButtonController} from '@/comps/builtin/base-button/BaseButtonController';
import BaseButtonComponent, {BaseButtonComponentRef} from '@/comps/builtin/base-button/BaseButtonComponent';
import {BaseInputController} from '@/comps/builtin/base-input/BaseInputController';
import BaseInputComponent, {BaseInputComponentRef} from '@/comps/builtin/base-input/BaseInputComponent';
import {BaseSelectController} from '@/comps/builtin/base-select/BaseSelectController';
import BaseSelectComponent, {BaseSelectComponentRef} from '@/comps/builtin/base-select/BaseSelectComponent';
import {SwitchController} from '@/comps/builtin/base-switch/BaseSwitchController';
import SwitchComponent, {SwitchComponentRef} from '@/comps/builtin/base-switch/BaseSwitchComponent';
import SwitchDefinition from '@/comps/builtin/base-switch/BaseSwitchDefinition';
import {AntdBaseDesignerController} from '@/comps/antd-common/AntdBaseDesignerController';

const originalEnv = Object.getOwnPropertyDescriptor(window, 'DATAVISOOL_ENV');
afterEach(() => {
    if (originalEnv) Object.defineProperty(window, 'DATAVISOOL_ENV', originalEnv);
    else delete (window as any).DATAVISOOL_ENV;
    componentUtilState.props = null;
    Object.values(componentUtilState.instance).forEach((value: any) => value.mockReset());
});

function createControllerBundle(Controller: new () => any, id: string, index: number | undefined, config = {base: {id}}) {
    const executor = {triggerComponentEvent: vi.fn()};
    const controller = new Controller();
    Object.assign(controller, {config, index, bpExecutor: executor});
    return {config, controller, executor};
}

function connectController(Controller: new () => any, id: string, index: number | undefined, instance: any, config = {base: {id}}) {
    const bundle = createControllerBundle(Controller, id, index, config);
    bundle.controller.instance = instance;
    bundle.controller.registerEvent();
    return bundle;
}

describe('representative built-in component event contracts', () => {
    it.each([0, 2, undefined])('forwards button clicks with index %s', index => {
        const ref = createRef<BaseButtonComponentRef>();
        const view = render(<BaseButtonComponent ref={ref} base={{id: 'button'} as any} style={{content: 'Run'} as any}/>);
        const {config, executor} = connectController(BaseButtonController, 'button', index, ref.current);

        fireEvent.click(view.getByRole('button', {name: 'Run'}));

        expect(executor.triggerComponentEvent).toHaveBeenCalledOnce();
        expect(executor.triggerComponentEvent).toHaveBeenCalledWith('button', 'click', config, index);
    });

    it.each([0, 2, undefined])('forwards input click and value with index %s', index => {
        const ref = createRef<BaseInputComponentRef>();
        const view = render(<BaseInputComponent ref={ref} base={{id: 'input'} as any}/>);
        const {config, executor} = connectController(BaseInputController, 'input', index, ref.current);
        const input = view.getByRole('textbox');

        fireEvent.click(input);
        fireEvent.change(input, {target: {value: 'entered'}});

        expect(executor.triggerComponentEvent.mock.calls).toEqual([
            ['input', 'click', config, index],
            ['input', 'valueChange', 'entered', index],
        ]);
    });

    it.each([0, 2, undefined])('forwards selection changes with index %s', index => {
        const ref = createRef<BaseSelectComponentRef>();
        const config = {base: {id: 'select'}, data: {value: [{value: 'alpha', label: 'Alpha'}, {value: 'beta', label: 'Beta'}]}} as any;
        const view = render(<BaseSelectComponent ref={ref} {...config}/>);
        const {executor} = connectController(BaseSelectController, 'select', index, ref.current, config);
        const select = view.getByRole('combobox', {name: 'select'});

        fireEvent.click(select);
        fireEvent.change(select, {target: {value: 'beta'}});

        expect(executor.triggerComponentEvent.mock.calls).toEqual([
            ['select', 'click', config, index],
            ['select', 'selectedChange', 'beta', index],
        ]);
    });

    it.each([{initial: false, next: true, edge: 'on'}, {initial: true, next: false, edge: 'off'}])(
        'forwards switch state events, including $edge, with index zero', ({initial, next, edge}) => {
            const ref = createRef<SwitchComponentRef>();
            const config = {base: {id: 'switch'}, data: {value: initial}} as any;
            const bundle = createControllerBundle(SwitchController, 'switch', 0, config);
            const view = render(<SwitchComponent ref={ref} {...config} controller={bundle.controller}/>);
            bundle.controller.instance = ref.current;
            bundle.controller.registerEvent();

            fireEvent.click(view.getByRole('button', {name: 'switch'}));

            expect(bundle.executor.triggerComponentEvent.mock.calls).toEqual([
                ['switch', 'valueChange', next, 0],
                ['switch', 'change', next, 0],
                ['switch', 'click', next, 0],
                ['switch', 'toggle', next, 0],
                ['switch', edge, config, 0],
            ]);
        });

    it('emits the correct before/after value once across consecutive clicks through the owning controller', () => {
        const ref = createRef<SwitchComponentRef>();
        const config = {base: {id: 'switch'}, data: {value: false}} as any;
        const bundle = createControllerBundle(SwitchController, 'switch', 2, config);
        const view = render(<SwitchComponent ref={ref} {...config} controller={bundle.controller}/>);
        bundle.controller.instance = ref.current;
        bundle.controller.registerEvent();
        const button = view.getByRole('button', {name: 'switch'});

        fireEvent.click(button);
        expect(bundle.controller.config.data.value).toBe(true);
        fireEvent.click(button);
        expect(bundle.controller.config.data.value).toBe(false);

        expect(bundle.executor.triggerComponentEvent.mock.calls.filter(([, event]) => event === 'toggle')).toEqual([
            ['switch', 'toggle', true, 2],
            ['switch', 'toggle', false, 2],
        ]);
        expect(bundle.executor.triggerComponentEvent.mock.calls.filter(([, event]) => event === 'valueChange')).toEqual([
            ['switch', 'valueChange', true, 2],
            ['switch', 'valueChange', false, 2],
        ]);
    });

    it('updates display state on setValue and emits one event for each programmatic ref toggle', () => {
        const ref = createRef<SwitchComponentRef>();
        const config = {base: {id: 'switch'}, data: {sourceType: 'static', value: false}} as any;
        const bundle = createControllerBundle(SwitchController, 'switch', 0, config);
        render(<SwitchComponent ref={ref} {...config} controller={bundle.controller}/>);
        bundle.controller.instance = ref.current;
        bundle.controller.registerEvent();

        act(() => ref.current?.setValue(true));
        expect(ref.current?.getValue()).toBe(true);
        act(() => ref.current?.toggle());
        expect(ref.current?.getValue()).toBe(false);
        act(() => ref.current?.toggle());
        expect(ref.current?.getValue()).toBe(true);

        expect(bundle.controller.config.data.value).toBe(true);
        expect(bundle.executor.triggerComponentEvent.mock.calls.filter(([, event]) => event === 'toggle')).toEqual([
            ['switch', 'toggle', false, 0],
            ['switch', 'toggle', true, 0],
        ]);
        expect(bundle.executor.triggerComponentEvent.mock.calls.filter(([, event]) => event === 'valueChange')).toEqual([
            ['switch', 'valueChange', true, 0],
            ['switch', 'valueChange', false, 0],
            ['switch', 'valueChange', true, 0],
        ]);
    });

    it('emits valueChange but not toggle for the blueprint updateData action', () => {
        const ref = createRef<SwitchComponentRef>();
        const config = {base: {id: 'switch'}, data: {value: false}} as any;
        const bundle = createControllerBundle(SwitchController, 'switch', 0, config);
        render(<SwitchComponent ref={ref} {...config} controller={bundle.controller}/>);
        bundle.controller.instance = ref.current;
        bundle.controller.registerEvent();
        const updateData = new SwitchDefinition().getActionList().find(action => action.id === 'updateData');

        act(() => updateData?.handler(bundle.controller, true));

        expect(ref.current?.getValue()).toBe(true);
        expect(bundle.executor.triggerComponentEvent.mock.calls).toEqual([
            ['switch', 'valueChange', true, 0],
        ]);
    });

    it.each([[1, true], [0, false], ['enabled', true], ['', false]])(
        'keeps legacy truthy/falsy display for initial value %s', (value, expected) => {
            const ref = createRef<SwitchComponentRef>();
            render(<SwitchComponent ref={ref} base={{id: 'switch'} as any} data={{value} as any}/>);
            expect(ref.current?.getValue()).toBe(expected);
        });

    it('keeps valueChange notifications for repeated programmatic updates to the same value', () => {
        const ref = createRef<SwitchComponentRef>();
        const config = {base: {id: 'switch'}, data: {value: false}} as any;
        const bundle = createControllerBundle(SwitchController, 'switch', 0, config);
        render(<SwitchComponent ref={ref} {...config} controller={bundle.controller}/>);
        bundle.controller.instance = ref.current;
        bundle.controller.registerEvent();
        const updateData = new SwitchDefinition().getActionList().find(action => action.id === 'updateData');

        act(() => {
            updateData?.handler(bundle.controller, true);
            updateData?.handler(bundle.controller, true);
        });

        expect(bundle.executor.triggerComponentEvent.mock.calls).toEqual([
            ['switch', 'valueChange', true, 0],
            ['switch', 'valueChange', true, 0],
        ]);
    });

    it('synchronizes data when its value is initially missing', () => {
        const ref = createRef<SwitchComponentRef>();
        const config = {base: {id: 'switch'}, data: {sourceType: 'static'}} as any;
        const bundle = createControllerBundle(SwitchController, 'switch', 0, config);
        const view = render(<SwitchComponent ref={ref} {...config} controller={bundle.controller}/>);
        bundle.controller.instance = ref.current;
        bundle.controller.registerEvent();

        fireEvent.click(view.getByRole('button', {name: 'switch'}));

        expect(bundle.controller.config.data.value).toBe(true);
        expect(ref.current?.getValue()).toBe(true);
        expect(bundle.executor.triggerComponentEvent.mock.calls.filter(([, event]) => event === 'valueChange')).toEqual([
            ['switch', 'valueChange', true, 0],
        ]);
    });

    it('uses its owner controller instead of a same-id controller in another page', () => {
        const ref = createRef<SwitchComponentRef>();
        const ownerConfig = {base: {id: 'shared-id'}, data: {value: false}} as any;
        const owner = createControllerBundle(SwitchController, 'shared-id', 0, ownerConfig);
        const otherPage = new SwitchController() as any;
        otherPage.config = {base: {id: 'shared-id'}, data: {value: false}};
        otherPage.changeData = vi.fn(data => { otherPage.config.data.value = data; });
        (window as any).DATAVISOOL_ENV = {currentManager: {layerManager: {controllers: {'shared-id': otherPage}}}};
        const view = render(<SwitchComponent ref={ref} {...ownerConfig} controller={owner.controller}/>);
        owner.controller.instance = ref.current;
        owner.controller.registerEvent();

        fireEvent.click(view.getByRole('button', {name: 'switch'}));

        expect(owner.controller.config.data.value).toBe(true);
        expect(otherPage.changeData).not.toHaveBeenCalled();
    });

    it('keeps same-id loop instances bound to their own indexed controllers', () => {
        const firstRef = createRef<SwitchComponentRef>();
        const secondRef = createRef<SwitchComponentRef>();
        const firstConfig = {base: {id: 'loop-switch'}, data: {value: false}} as any;
        const secondConfig = {base: {id: 'loop-switch'}, data: {value: false}} as any;
        const first = createControllerBundle(SwitchController, 'loop-switch', 0, firstConfig);
        const second = createControllerBundle(SwitchController, 'loop-switch', 1, secondConfig);
        (window as any).DATAVISOOL_ENV = {currentManager: {layerManager: {controllers: {'loop-switch': second.controller}}}};
        const view = render(<>
            <SwitchComponent ref={firstRef} {...firstConfig} controller={first.controller}/>
            <SwitchComponent ref={secondRef} {...secondConfig} controller={second.controller}/>
        </>);
        first.controller.instance = firstRef.current;
        second.controller.instance = secondRef.current;
        first.controller.registerEvent();
        second.controller.registerEvent();

        const [firstButton, secondButton] = view.getAllByRole('button', {name: 'switch'});
        fireEvent.click(firstButton);
        fireEvent.click(secondButton);

        expect(first.controller.config.data.value).toBe(true);
        expect(second.controller.config.data.value).toBe(true);
        expect(first.executor.triggerComponentEvent).toHaveBeenCalledWith('loop-switch', 'toggle', true, 0);
        expect(second.executor.triggerComponentEvent).toHaveBeenCalledWith('loop-switch', 'toggle', true, 1);
    });

    it('does not emit switch events from disabled controls or labels', () => {
        const ref = createRef<SwitchComponentRef>();
        const config = {
            base: {id: 'switch'}, data: {value: false},
            style: {props: {disabled: true}, label: {position: 'left', content: 'Disabled toggle'}},
        } as any;
        const bundle = createControllerBundle(SwitchController, 'switch', 0, config);
        const view = render(<SwitchComponent ref={ref} {...config} controller={bundle.controller}/>);
        bundle.controller.instance = ref.current;
        bundle.controller.registerEvent();

        fireEvent.click(view.getByRole('button', {name: 'switch'}));
        fireEvent.click(view.getByText('Disabled toggle'));

        expect(bundle.executor.triggerComponentEvent).not.toHaveBeenCalled();
    });

    it('passes the owner controller to React only and never adds it to stored project config', async () => {
        const controller = new SwitchController();
        const config = {base: {id: 'switch'}, data: {value: false}} as any;
        await controller.create(document.createElement('div'), config, {triggerComponentEvent: vi.fn()} as any, 1);

        expect(componentUtilState.props.controller).toBe(controller);
        expect(controller.getConfig()).toEqual(config);
        expect(controller.getConfig()).not.toHaveProperty('controller');

        controller.update({style: {props: {disabled: true}}} as any);
        expect(componentUtilState.instance.updateConfig).toHaveBeenCalledWith(expect.objectContaining({controller}));
        expect(controller.getConfig()).not.toHaveProperty('controller');
    });

    it('registers all shared chart click events and forwards the same loop index', () => {
        const config = {base: {id: 'chart'}};
        const handlers: Record<string, (...args: any[]) => void> = {};
        const chart = new (AntdBaseDesignerController as any)();
        const executor = {triggerComponentEvent: vi.fn()};
        Object.assign(chart, {
            config, index: 0, bpExecutor: executor,
            instance: {on: (event: string, handler: (...args: any[]) => void) => {handlers[event] = handler;}},
        });
        chart.registerEvent();

        handlers['plot:click']();
        handlers['element:click']({data: {data: {value: 42}}});
        handlers['legend-item:click']();
        handlers['legend-item-name:click']();
        handlers['axis-label:click']();

        expect(executor.triggerComponentEvent.mock.calls).toEqual([
            ['chart', 'globalClick', config, 0],
            ['chart', 'elementClick', {selectedData: {value: 42}, ...config}, 0],
            ['chart', 'legendClick', config, 0],
            ['chart', 'elementNameClick', config, 0],
            ['chart', 'axisLabelClick', config, 0],
        ]);
    });
});
