/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {describe, expect, it, vi} from 'vitest';
import AntdLiquidController from '@/comps/antd/liquid/AntdLiquidController.ts';

vi.mock('@antv/g2plot', () => ({
    Liquid: class MockLiquid {},
}));

function createWave(matrix: number[] | null) {
    return {
        get: vi.fn((name: string) => name === 'name' ? 'waterwave-path' : undefined),
        getMatrix: vi.fn(() => matrix),
        setMatrix: vi.fn(),
        animate: vi.fn(),
    };
}

describe('AntdLiquidController data updates', () => {
    it('applies the first and subsequent updates immediately', () => {
        const controller = new AntdLiquidController();
        const changeData = vi.fn();
        const findAll = vi.fn(() => []);
        controller.config = {
            base: {id: 'liquid', type: 'AntdLiquid'},
            data: {value: 0.65},
            style: {percent: 0.65},
        } as any;
        controller.instance = {
            changeData,
            chart: {getCanvas: () => ({findAll})},
        } as any;

        controller.changeData(0.2);
        controller.changeData(0.8);

        expect(changeData.mock.calls).toEqual([[0.2], [0.8]]);
        expect(controller.config.data.value).toBe(0.8);
        expect(controller.config.style.percent).toBe(0.8);
        expect(findAll).toHaveBeenCalledTimes(2);
    });

    it('restarts every water wave animation after updating data', () => {
        const controller = new AntdLiquidController();
        const firstWave = createWave([1, 0, 0, 0, 1, 0, -10, 0, 1]);
        const secondWave = createWave(null);
        const elements = [firstWave, secondWave];
        controller.config = {
            base: {id: 'liquid', type: 'AntdLiquid'},
            data: {value: 0.65},
            style: {percent: 0.65, wave: {length: 100}},
        } as any;
        controller.instance = {
            changeData: vi.fn(),
            chart: {
                getCanvas: () => ({
                    findAll: (predicate: (element: any) => boolean) => elements.filter(predicate),
                }),
            },
        } as any;

        controller.changeData(0.4);

        expect(firstWave.setMatrix).toHaveBeenCalledWith([1, 0, 0, 0, 1, 0, 90, 0, 1]);
        expect(firstWave.animate).toHaveBeenCalledWith(
            {matrix: [1, 0, 0, 0, 1, 0, 190, 0, 1]},
            {duration: 2500, repeat: true},
        );
        expect(secondWave.setMatrix).toHaveBeenCalledWith([1, 0, 0, 0, 1, 0, 0, 0, 1]);
        expect(secondWave.animate).toHaveBeenCalledWith(
            {matrix: [1, 0, 0, 0, 1, 0, 100, 0, 1]},
            {duration: 5000, repeat: true},
        );
    });

    it('does not restart waves when animation is disabled', () => {
        const controller = new AntdLiquidController();
        const getCanvas = vi.fn();
        const changeData = vi.fn();
        controller.config = {
            base: {id: 'liquid', type: 'AntdLiquid'},
            data: {value: 0.65},
            style: {percent: 0.65, animation: false},
        } as any;
        controller.instance = {
            changeData,
            chart: {getCanvas},
        } as any;

        controller.changeData(0.3);

        expect(changeData).toHaveBeenCalledWith(0.3);
        expect(getCanvas).not.toHaveBeenCalled();
    });
});
