/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import React from 'react';
import {act, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {afterAll, afterEach, beforeAll, describe, expect, it, vi} from 'vitest';

vi.mock('@/util/AuthFetchUtil.ts', () => ({default: {get: vi.fn(async () => [{id: 'item-1', name: '测试数据源'}])}}));

import {MQTTConfig} from '@/comps/common-component/data-source-config/MQTTConfig';
import {DatabaseDataConfig} from '@/comps/common-component/data-source-config/DatabaseConfig';
import CommonApiConfig from '@/comps/common-component/data-source-config/CommonApiConfig';
import {GlobalVariableConfig} from '@/comps/common-component/data-source-config/GlobalVariableConfig';
import {StaticDataConfig} from '@/comps/common-component/data-source-config/StaticDataConfig';
import DataSourceConfig from '@/comps/common-component/data-source-config/DataSourceConfig';
import {VisibleNodeConfig} from '@/designer/blueprint/node/core/impl/visible/VisibleNodeConfig';
import EChartsCustomDataUpdateConfig from '@/comps/echarts/EChartsCustomDataUpdateConfig';
import {AxisConfig} from '@/comps/antd-common/config/axis/AxisConfig';
import {AntdLegend} from '@/comps/antd-common/config/legend/AntdLegend';
import AuthFetchUtil from '@/util/AuthFetchUtil';

describe('shared GUI data source and blueprint panels', () => {
    const previousEnvironment = window.DATAVISOOL_ENV;
    const originalBoundingRect = Object.getOwnPropertyDescriptor(Range.prototype, 'getBoundingClientRect');
    const originalClientRects = Object.getOwnPropertyDescriptor(Range.prototype, 'getClientRects');
    beforeAll(() => {
        if (!Range.prototype.getBoundingClientRect) Object.defineProperty(Range.prototype, 'getBoundingClientRect', {configurable: true, value: () => new DOMRect()});
        if (!Range.prototype.getClientRects) Object.defineProperty(Range.prototype, 'getClientRects', {configurable: true, value: () => []});
    });
    afterEach(() => { window.DATAVISOOL_ENV = previousEnvironment; });
    afterAll(() => {
        if (!originalBoundingRect) delete (Range.prototype as Partial<Range>).getBoundingClientRect;
        if (!originalClientRects) delete (Range.prototype as Partial<Range>).getClientRects;
    });

    it('saves a changed MQTT address', () => {
        const onSave = vi.fn();
        render(<MQTTConfig data={{host: 'ws://old', port: 8080, topics: 'demo'} as never} onSave={onSave}/>);
        fireEvent.change(screen.getByDisplayValue('ws://old'), {target: {value: 'ws://new'}});
        fireEvent.click(screen.getByRole('button', {name: '保存'}));
        expect(onSave.mock.calls[0][0]).toEqual(expect.objectContaining({host: 'ws://new', topics: 'demo'}));
    });

    it('selects and saves the database configuration', async () => {
        const onSave = vi.fn();
        render(<DatabaseDataConfig data={{sql: 'SELECT 1'} as never} onSave={onSave}/>);
        fireEvent.click(await screen.findByRole('combobox'));
        fireEvent.click(await screen.findByText('测试数据源'));
        fireEvent.click(screen.getByRole('button', {name: '保存'}));
        expect(onSave.mock.calls[0][0]).toEqual(expect.objectContaining({targetDb: 'item-1', sql: 'SELECT 1'}));
    });

    it('selects and saves the common API configuration', async () => {
        const onSave = vi.fn();
        render(<CommonApiConfig data={{} as never} onSave={onSave}/>);
        fireEvent.click(screen.getByRole('combobox'));
        fireEvent.click(await screen.findByText('测试数据源'));
        fireEvent.click(screen.getByRole('button', {name: '保存'}));
        expect(onSave.mock.calls[0][0]).toEqual(expect.objectContaining({commonApiId: 'item-1'}));
    });

    it('preserves special characters in a common API search query', async () => {
        render(<CommonApiConfig data={{} as never} onSave={vi.fn()}/>);
        fireEvent.click(screen.getByRole('combobox'));
        fireEvent.change(screen.getByPlaceholderText('请选择'), {target: {value: 'a&b=中文'}});
        await waitFor(() => {
            const calls = vi.mocked(AuthFetchUtil.get).mock.calls;
            const url = calls.map(([path]) => new URL(String(path), 'http://localhost'))
                .find(value => value.pathname === '/api/commonApi/quickSearch' && value.searchParams.get('search') === 'a&b=中文');
            expect(url?.searchParams.has('b')).toBe(false);
        });
    });

    it('selects and saves a global variable', async () => {
        window.DATAVISOOL_ENV = {currentManager: {globalVariableManager: {globalVariableInstance: {'item-1': {id: 'item-1', key: '测试变量'}}}}} as never;
        const onSave = vi.fn();
        render(<GlobalVariableConfig data={{} as never} onSave={onSave}/>);
        fireEvent.click(screen.getByRole('combobox'));
        fireEvent.click(await screen.findByText('测试变量'));
        fireEvent.click(screen.getByRole('button', {name: '保存'}));
        expect(onSave.mock.calls[0][0]).toEqual(expect.objectContaining({gvId: 'item-1'}));
    });

    it('saves changed static data', async () => {
        const onSave = vi.fn();
        const {container} = render(<StaticDataConfig data={{value: {data: 1}} as never} onSave={onSave}/>);
        const editor = container.querySelector('.CodeMirror') as HTMLElement & {CodeMirror: {setValue(value: string): void}};
        act(() => editor.CodeMirror.setValue('{"data": 2}'));
        fireEvent.click(screen.getByRole('button', {name: '保存'}));
        await waitFor(() => expect(onSave).toHaveBeenCalled());
        expect(onSave.mock.calls[0][1]).toEqual({data: 2});
    });

    it('switches the data source configuration from static data to API', async () => {
        render(<DataSourceConfig data={{sourceType: 'static'} as never} onSave={vi.fn()}/>);
        fireEvent.click(screen.getByRole('combobox'));
        fireEvent.click(await screen.findByText('接口(API)'));
        expect(await screen.findByText('接口地址')).toBeInTheDocument();
    });

    it('updates the visibility node target', async () => {
        window.DATAVISOOL_ENV = {currentManager: {layerManager: {layerConfigs: {'item-1': {id: 'item-1', name: '测试图层'}}}}} as never;
        const controller = {getConfig: () => ({}), update: vi.fn()};
        render(<VisibleNodeConfig controller={controller as never}/>);
        fireEvent.click(screen.getByRole('combobox'));
        fireEvent.click(await screen.findByText('测试图层'));
        expect(controller.update).toHaveBeenCalledWith({nodeConfig: {nodeIds: ['item-1']}});
    });

    it('saves custom ECharts data update code', () => {
        const controller = {getConfig: () => ({style: {customDataUpdateCode: ''}}), update: vi.fn()};
        const {container} = render(<EChartsCustomDataUpdateConfig controller={controller as never}/>);
        const editor = container.querySelector('.CodeMirror') as HTMLElement & {CodeMirror: {setValue(value: string): void}};
        act(() => editor.CodeMirror.setValue('function update(data) { return data; }'));
        fireEvent.click(screen.getByRole('button', {name: '保存自定义处理函数'}));
        expect(controller.update).toHaveBeenCalledWith({style: {customDataUpdateCode: 'function update(data) { return data; }'}}, {reRender: false});
    });

    it('updates the chart axis settings', () => {
        const onChange = vi.fn();
        render(<AxisConfig config={undefined} onChange={onChange} title="坐标轴"/>);
        fireEvent.click(screen.getByRole('button', {name: '坐标轴'}));
        fireEvent.click(screen.getByRole('button', {name: '基础'}));
        fireEvent.click(screen.getAllByRole('switch')[0]);
        expect(onChange).toHaveBeenCalled();
    });

    it('updates chart legend settings', () => {
        const controller = {getConfig: () => ({style: {legend: false}}), update: vi.fn()};
        render(<AntdLegend controller={controller as never}/>);
        const accordion = screen.getByRole('button', {name: '图例'});
        if (accordion.getAttribute('aria-expanded') === 'false') fireEvent.click(accordion);
        fireEvent.click(screen.getAllByRole('switch')[0]);
        expect(controller.update).toHaveBeenCalledWith(expect.objectContaining({style: expect.objectContaining({legend: expect.anything()})}));
    });
});
