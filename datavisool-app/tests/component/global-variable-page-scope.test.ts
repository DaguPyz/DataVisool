/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {afterEach, describe, expect, it, vi} from 'vitest';
import {waitFor} from '@testing-library/react';
import {DesignerMode} from '@datavisool/sdk/types';
import ComponentDataUpdater from '@/framework/core/tools/ComponentDataUpdater';
import AbstractDesignerController from '@/framework/core/AbstractDesignerController';
import GlobalVariable from '@/designer/left/global-variable/GlobalVariable';
import componentDataGvParser from '@/designer/left/global-variable/parse/ComponentDataGvParser';


class TestController extends AbstractDesignerController<unknown, any> {
    changeData = vi.fn();
    update(config: any) { this.config = config; }
    getConfig() { return this.config; }
}
const makeManager = (value: unknown, id = 'shared-id') => {
    const variable = new GlobalVariable(id, 'amount', value, true, ['component']);
    return {globalVariableManager: {globalVariableInstance: {[id]: variable}}, layerManager: {layerConfigs: {}, controllers: {}}};
};
const previousEnv = window.DATAVISOOL_ENV;
afterEach(() => { window.DATAVISOOL_ENV = previousEnv; vi.restoreAllMocks(); });

describe('page scoped component data', () => {
    it('loads each page variable even when the IDs collide, and does not fall back to the outer page', async () => {
        const outer = makeManager('outer');
        const inner = makeManager('inner');
        window.DATAVISOOL_ENV = {mode: DesignerMode.PREVIEW, currentManager: outer} as any;
        const receivedOuter = vi.fn(); const receivedInner = vi.fn(); const missing = vi.fn();
        const a = new ComponentDataUpdater(receivedOuter, vi.fn(), outer as any);
        const b = new ComponentDataUpdater(receivedInner, vi.fn(), inner as any);
        const c = new ComponentDataUpdater(vi.fn(), missing, makeManager('other', 'another-id') as any);
        const config = {sourceType: 'globalVariable', globalVariable: {gvId: 'shared-id'}} as any;
        try {
            a.run(config); b.run(config); c.run(config);
            await waitFor(() => { expect(receivedOuter).toHaveBeenCalledWith('outer'); expect(receivedInner).toHaveBeenCalledWith('inner'); });
            expect(missing).toHaveBeenCalledOnce();
        } finally { a.destroy(); b.destroy(); c.destroy(); }
    });

    it('uses the owning page for API and database variable expressions', () => {
        const outer = makeManager('outer'); const inner = makeManager('inner');
        window.DATAVISOOL_ENV = {mode: DesignerMode.PREVIEW, currentManager: outer} as any;
        expect(componentDataGvParser.parseApiData({url: '/#{amount}', params: {}, headers: {}} as any, inner as any).url).toBe('/inner');
        expect(componentDataGvParser.parseDatabase({sql: 'select #{amount}'} as any, inner as any).sql).toBe('select inner');
    });

    it('loads data through the host controller and refreshes it when the owning variable changes', async () => {
        const outer = makeManager('outer'); const inner = makeManager('inner');
        window.DATAVISOOL_ENV = {mode: DesignerMode.PREVIEW, currentManager: outer} as any;
        const controller = new TestController(); controller.designerManager = inner as any;
        const executor = {triggerComponentEvent: vi.fn()} as any;
        await controller.create(document.createElement('div'), {base: {id: 'component'}, data: {sourceType: 'globalVariable', globalVariable: {gvId: 'shared-id'}}}, executor);
        const variable = inner.globalVariableManager.globalVariableInstance['shared-id'];
        variable.start({controllers: {component: controller}, manager: inner as any}, executor);
        try {
            controller.loadComponentData();
            await waitFor(() => expect(controller.changeData).toHaveBeenCalledWith('inner'));
            variable.setValue('updated');
            await waitFor(() => expect(controller.changeData).toHaveBeenCalledWith('updated'));
            expect(controller.changeData).not.toHaveBeenCalledWith('outer');
        } finally { variable.stop(); controller.destroy(); }
    });
});
