/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import React, {useState} from 'react';
import {fireEvent, render, screen, within} from '@testing-library/react';
import {afterEach, expect, it, vi} from 'vitest';
afterEach(() => { vi.doUnmock('@antv/g2plot'); });

function field(container: HTMLElement, label: string) {
    const labelNode = within(container).getByText(label, {selector: '.datavisool-field-label-text'});
    const root = labelNode.closest('.datavisool-field');
    if (!root) throw new Error(`Missing field: ${label}`);
    return root;
}

function chooseField(container: HTMLElement, label: string, option: string) {
    fireEvent.click(within(field(container, label)).getByRole('combobox'));
    fireEvent.click(screen.getByRole('option', {name: option}));
}

it('carries bubble mappings and graphic settings from GUI through save/restore into plot options and click events', async () => {
    const plotInstances: any[] = [];
    class FakeScatterPlot {
        options: any;
        handlers = new Map<string, (...args: any[]) => void>();
        update = vi.fn((options: any) => { this.options = options; });
        render = vi.fn();
        destroy = vi.fn();
        changeData = vi.fn();
        on = vi.fn((event: string, handler: (...args: any[]) => void) => this.handlers.set(event, handler));
        constructor(_container: HTMLElement, options: any) {
            this.options = options;
            plotInstances.push(this);
        }
    }
    vi.doMock('@antv/g2plot', () => ({Scatter: FakeScatterPlot}));
    const [{default: AntdCommonScatterController}, {AntdCommonScatterGraphics, AntdScatterFieldMapping}] = await Promise.all([
        import('@/comps/antd-common/scatter/AntdCommonScatterController'),
        import('@/comps/antd-common/scatter/AntdScatterCommonConfig'),
    ]);
    const initialData = [
        {time: '09:00', revenue: 120, orders: 8, segment: 'north'},
        {time: '10:00', revenue: 190, orders: 15, segment: 'south'},
    ];
    const initialConfig: any = {
        base: {id: 'bubble-chart', type: 'AntdScatterBubble'},
        data: {sourceType: 'static', value: initialData},
        style: {
            xField: 'time', yField: 'revenue', colorField: 'segment', sizeField: 'orders',
            size: [4, 18], shape: 'circle', pointStyle: {lineWidth: 1, stroke: '#ffffff'},
        },
    };
    const eventCalls: any[][] = [];
    const executor = {triggerComponentEvent: (...args: any[]) => eventCalls.push(args)};
    const controller = new AntdCommonScatterController();
    await controller.create(document.createElement('div'), initialConfig, executor as any, 3);

    function ConfigPanels() {
        const [, refresh] = useState(0);
        const update = (fragment: any) => {
            controller.update(fragment);
            refresh(value => value + 1);
        };
        return <>
            <AntdScatterFieldMapping controller={controller as any}/>
            <AntdCommonScatterGraphics config={controller.getConfig()!.style} onChange={style => update({style})}/>
        </>;
    }

    const {container} = render(<ConfigPanels/>);
    chooseField(container, 'X字段', 'revenue');
    chooseField(container, 'Y字段', 'orders');
    chooseField(container, '颜色字段', 'segment');
    chooseField(container, '尺寸字段', 'revenue');

    const graphics = screen.getByRole('button', {name: '图形'});
    fireEvent.click(graphics);
    fireEvent.change(within(field(container, '最小尺寸')).getByRole('spinbutton'), {target: {value: '6'}});
    fireEvent.change(within(field(container, '最大尺寸')).getByRole('spinbutton'), {target: {value: '28'}});
    chooseField(container, '形状', '钻石');
    fireEvent.change(within(field(container, '线宽')).getByRole('spinbutton'), {target: {value: '2'}});

    const edited = controller.getConfig()!;
    expect(edited.style).toEqual(expect.objectContaining({
        xField: 'revenue', yField: 'orders', colorField: 'segment', sizeField: 'revenue',
        data: initialData, size: [6, 28], shape: 'diamond', pointStyle: {lineWidth: 2, stroke: '#ffffff'},
    }));
    expect(plotInstances[0].update).toHaveBeenLastCalledWith(edited.style);

    const restoredConfig = JSON.parse(JSON.stringify(edited));
    const restoredController = new AntdCommonScatterController();
    await restoredController.create(document.createElement('div'), restoredConfig, executor as any, 3);
    expect(plotInstances[1].options).toEqual(expect.objectContaining({
        data: initialData, xField: 'revenue', yField: 'orders', colorField: 'segment', sizeField: 'revenue',
        size: [6, 28], shape: 'diamond', pointStyle: {lineWidth: 2, stroke: '#ffffff'},
    }));

    restoredController.registerEvent();
    plotInstances[1].handlers.get('element:click')?.({data: {data: initialData[1]}});
    expect(eventCalls).toEqual([[
        'bubble-chart', 'elementClick', {selectedData: initialData[1], ...restoredController.getConfig()}, 3,
    ]]);

    const nextData = [{time: '11:00', revenue: 260, orders: 21, segment: 'north'}];
    restoredController.changeData(nextData);
    expect(restoredController.getConfig()!.data!.value).toEqual(nextData);
    expect(restoredController.getConfig()!.style!.data).toEqual(nextData);
    expect(plotInstances[1].changeData).toHaveBeenCalledWith(nextData);
});
