/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import React from 'react';
import {act, cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {ObjectUtil} from '@datavisool/sdk';
import AbstractDesignerController from '@/framework/core/AbstractDesignerController';

vi.mock('@/designer/loader/DesignerLoader', () => ({default: {definitionMap: {}}}));
vi.mock('@/comps/common-component/base-info/BaseInfo', () => ({default: () => null}));
vi.mock('@/comps/common-component/theme-config/ThemeConfig', () => ({default: () => null}));
vi.mock('@/comps/common-component/filter-config/FilterConfig', () => ({default: () => null}));
vi.mock('@/comps/common-component/data-config/DataConfig', () => ({default: () => null}));
vi.mock('@/designer/right/status-list/ComponentStatusList', () => ({default: () => null}));
vi.mock('@/designer/left/global-variable/parse/ComponentDataGvParser', () => ({
    default: {unbindFromGv: vi.fn(), bindConfigToGv: vi.fn()},
}));

import ConfigContent from '@/designer/right/ConfigContent';
import rightStore from '@/designer/right/RightStore';
import statusListStore from '@/designer/right/status-list/StatusListStore';
import DesignerLoader from '@/designer/loader/DesignerLoader';
import {historyOperator} from '@/designer/operate-provider/undo-redo/HistoryOperator';
import {StyleRollbackImpl} from '@/designer/operate-provider/undo-redo/core/StyleRollbackImpl';

describe('configuration panel history with an SDK consumer', () => {
    const previousEnvironment = window.DATAVISOOL_ENV;
    afterEach(() => {
        cleanup();
        historyOperator.reset();
        rightStore.activeConfig(null, null);
        statusListStore.destroy();
        delete DesignerLoader.definitionMap.sample;
        window.DATAVISOOL_ENV = previousEnvironment;
    });

    it('records a panel edit and restores the original and new values', () => {
        class Controller extends AbstractDesignerController<unknown, any> {
            #identity = 'sample';
            constructor() {
                super();
                this.config = {base: {id: this.#identity, type: 'sample'}, style: {text: 'before'}};
            }
            getConfig() { return this.#identity ? this.config : null; }
            update(patch: object) { if (this.#identity) ObjectUtil.merge(this.config, patch); }
        }
        const controller = new Controller();
        const Editor = ({controller: target}: {controller: Controller}) => <button onClick={() => target.update({style: {text: 'after'}})}>Edit {target.getConfig()?.style.text}</button>;
        DesignerLoader.definitionMap.sample = {
            getBaseInfo: () => ({compName: 'Test component'}),
            getMenuList: () => [{key: 'style', name: '样式'}],
            getMenuToConfigContentMap: () => ({style: Editor}),
        } as never;
        window.DATAVISOOL_ENV = {currentManager: {layerManager: {controllers: {sample: controller}}}} as never;
        act(() => { rightStore.activeConfig('sample', 'sample'); });
        render(<ConfigContent/>);
        fireEvent.click(screen.getByRole('button', {name: 'Edit before'}));
        expect(controller.getConfig().style.text).toBe('after');

        const undo = historyOperator.backoff();
        expect(undo?.actions).toHaveLength(1);
        const rollback = new StyleRollbackImpl();
        act(() => rollback.undo(undo!.actions[0]));
        expect(controller.getConfig().style.text).toBe('before');
        const redo = historyOperator.forward();
        expect(redo?.actions).toHaveLength(1);
        act(() => rollback.redo(redo!.actions[0]));
        expect(controller.getConfig().style.text).toBe('after');
    });
});
