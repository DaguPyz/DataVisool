/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {waitFor} from '@testing-library/react';
import {expect, it, vi} from 'vitest';
import AbstractDesignerController from '@/framework/core/AbstractDesignerController';
import BPExecutor from '@/designer/blueprint/core/BPExecutor';

class Controller extends AbstractDesignerController<unknown, any> {
    changeData = vi.fn();
    update(config: any) { this.config = config; }
    getConfig() { return this.config; }
}

it('loads data for multiple components that start at the same time', async () => {
    const first = new Controller();
    const second = new Controller();
    const executor = new BPExecutor({} as any);
    await first.create(document.createElement('div'), {data: {sourceType: 'static', staticData: {value: 'first'}}}, executor);
    await second.create(document.createElement('div'), {data: {sourceType: 'static', staticData: {value: 'second'}}}, executor);
    try {
        first.loadComponentData();
        second.loadComponentData();
        await waitFor(() => {
            expect(first.changeData).toHaveBeenCalledWith('first');
            expect(second.changeData).toHaveBeenCalledWith('second');
        });
    } finally {
        first.destroy();
        second.destroy();
    }
});
