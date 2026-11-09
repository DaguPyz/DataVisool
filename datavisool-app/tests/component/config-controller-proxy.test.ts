/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {describe, expect, it, vi} from 'vitest';
import {createConfigControllerProxy} from '@/designer/right/ConfigControllerProxy';
import {isDataConfigControllerCurrent} from '@/comps/common-component/data-config/DataConfigControllerGuard';

describe('configuration panel controller proxy', () => {
    it('calls the real controller for private fields and records explicit updates', () => {
        class Controller {
            #config = {base: {id: 'sample'}, value: 1};
            get config() { return this.#config; }
            getConfig() { return this.#config; }
            update(patch: {value: number}) { this.#config.value = patch.value; }
            changeData(value: number) { this.update({value}); }
        }
        const controller = new Controller();
        const record = vi.fn((target: Controller, args: any[]) => target.update(args[0]));
        const proxy = createConfigControllerProxy(controller as never, record as never) as unknown as Controller;

        expect(proxy.getConfig().value).toBe(1);
        expect(proxy.config.value).toBe(1);
        expect(proxy.getConfig).toBe(proxy.getConfig);
        expect(isDataConfigControllerCurrent(proxy as never, 'sample', {sample: controller as never})).toBe(true);
        proxy.update({value: 2});
        expect(controller.getConfig().value).toBe(2);
        expect(record).toHaveBeenCalledOnce();
        proxy.changeData(3);
        expect(controller.getConfig().value).toBe(3);
        expect(record).toHaveBeenCalledOnce();
    });
});
