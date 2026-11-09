/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import React, {Suspense} from 'react';
import {fireEvent, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import BaseImageDefinition from '@/comps/builtin/base-image/BaseImageDefinition';
import BaseTableDefinition from '@/comps/builtin/base-table/BaseTableDefinition';
import BaseButtonDefinition from '@/comps/builtin/base-button/BaseButtonDefinition';
import {TimerNodeConfig} from '@/designer/blueprint/node/core/impl/timer/TimerNodeConfig';
import {PopupBoxNodeConfig} from '@/designer/blueprint/node/core/impl/popup-box/PopupBoxNodeConfig';
import {ApiDataConfig} from '@/comps/common-component/data-source-config/ApiDataConfig';
import {WebSocketConfig} from '@/comps/common-component/data-source-config/WebSocketConfig';
import MapLibreGisConfig from '@/comps/maplibre-gis/map-base/MapLibreGisConfig';

describe('shared GUI component configuration panels', () => {
    const previousEnvironment = window.DATAVISOOL_ENV;
    afterEach(() => { window.DATAVISOOL_ENV = previousEnvironment; });
    it.each([
        ['图片', BaseImageDefinition],
        ['表格', BaseTableDefinition],
        ['按钮', BaseButtonDefinition],
    ])('renders %s settings with its default configuration', async (_name, Definition) => {
        window.DATAVISOOL_ENV = {fonts: []} as never;
        const definition = new Definition();
        const config = definition.getInitConfig();
        const controller = {getConfig: () => config, update: vi.fn()};
        const Panel = definition.getMenuToConfigContentMap().style as React.ComponentType<any>;
        render(<Suspense fallback={<span>加载中</span>}><Panel controller={controller}/></Suspense>);
        expect(await screen.findByText(_name === '图片' ? '透明度' : _name === '表格' ? '表头' : '基础')).toBeInTheDocument();
    });

    it('updates the image URL through the shared GUI', async () => {
        const definition = new BaseImageDefinition();
        const controller = {getConfig: () => definition.getInitConfig(), update: vi.fn()};
        const Panel = definition.getMenuToConfigContentMap().style as React.ComponentType<any>;
        render(<Suspense fallback={<span>加载中</span>}><Panel controller={controller}/></Suspense>);
        const input = await screen.findByDisplayValue('');
        fireEvent.change(input, {target: {value: 'https://example.com/image.png'}});
        expect(controller.update).toHaveBeenCalledWith({style: {onLineUrl: 'https://example.com/image.png'}});
    });

    it('updates a blueprint timer interval through the shared GUI', () => {
        const controller = {getConfig: () => ({loop: true, interval: 5}), update: vi.fn()};
        render(<TimerNodeConfig controller={controller as never}/>);
        fireEvent.change(screen.getByDisplayValue('5'), {target: {value: '10'}});
        expect(controller.update).toHaveBeenCalledWith({interval: 10});
    });

    it('updates a blueprint popup title through the shared GUI', () => {
        window.DATAVISOOL_ENV = {currentManager: {layerManager: {layerConfigs: {}}}} as never;
        const controller = {getConfig: () => ({title: '原始标题'}), update: vi.fn()};
        render(<PopupBoxNodeConfig controller={controller as never}/>);
        fireEvent.change(screen.getByDisplayValue('原始标题'), {target: {value: '新标题'}});
        expect(controller.update).toHaveBeenCalledWith({title: '新标题'});
    });

    it('saves the changed API address', () => {
        const onSave = vi.fn();
        render(<ApiDataConfig data={{url: 'https://example.com/old', method: 'get'} as never} onSave={onSave}/>);
        fireEvent.change(screen.getByDisplayValue('https://example.com/old'), {target: {value: 'https://example.com/new'}});
        fireEvent.click(screen.getByRole('button', {name: '保存'}));
        expect(onSave).toHaveBeenCalledOnce();
        expect(onSave.mock.calls[0][0]).toEqual(expect.objectContaining({url: 'https://example.com/new', method: 'get'}));
    });

    it('saves the changed WebSocket address without connecting', () => {
        const onSave = vi.fn();
        render(<WebSocketConfig data={{url: 'ws://localhost/old', protocols: ''}} onSave={onSave}/>);
        fireEvent.change(screen.getByDisplayValue('ws://localhost/old'), {target: {value: 'ws://localhost/new'}});
        fireEvent.click(screen.getByRole('button', {name: '保存'}));
        expect(onSave).toHaveBeenCalledOnce();
        expect(onSave.mock.calls[0][0]).toEqual(expect.objectContaining({url: 'ws://localhost/new'}));
    });

    it('updates and refreshes MapLibre map settings', () => {
        const controller = {getConfig: () => ({style: {base: {styleUrl: 'https://example.com/old.json'}}}), update: vi.fn(), refreshMap: vi.fn()};
        render(<MapLibreGisConfig controller={controller as never}/>);
        fireEvent.change(screen.getByDisplayValue('https://example.com/old.json'), {target: {value: 'https://example.com/new.json'}});
        expect(controller.update).toHaveBeenCalledWith({style: {base: {styleUrl: 'https://example.com/new.json'}}});
        fireEvent.click(screen.getByRole('button', {name: '刷新地图'}));
        expect(controller.refreshMap).toHaveBeenCalledOnce();
    });
});
