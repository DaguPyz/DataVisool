/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {afterEach, describe, expect, it, vi} from 'vitest';
import loopContainerSampleDataStore from '@/designer/store/LoopContainerSampleDataStore.ts';
import {resolveInitialStaticData} from '@/comps/common-component/data-source-config/StaticDataConfigUtil.ts';

vi.mock('@/comps/loop-container/LoopContainer.tsx', () => ({
    default: () => null,
}));

vi.mock('@/designer/manager/DesignerManager.ts', () => {
    class MockDesignerManager {
        public scene: any;
        public layerManager = {controllers: {}};
        public canvasManager = {canvasConfig: {}};
        public bpExecutor = {triggerComponentEvent: vi.fn()};

        constructor(scene: any) {
            this.scene = scene;
        }
    }

    return {
        default: MockDesignerManager,
    };
});

describe('LoopContainer sample data flow', () => {
    afterEach(() => {
        loopContainerSampleDataStore.reset();
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it('uses current spacing fields and does not interpret the old gap field', async () => {
        const {default: LoopContainerController} = await import('@/comps/loop-container/LoopContainerController.ts');
        const controller = new LoopContainerController();
        controller.config = {style: {gap: 19, horizontalGap: 4, verticalGap: 7}} as any;
        expect(controller.getConfig()?.style).toMatchObject({horizontalGap: 4, verticalGap: 7});
        controller.config = {style: {gap: 19}} as any;
        expect(controller.getConfig()?.style).toMatchObject({horizontalGap: 0, verticalGap: 0});
    });

    it('stores the current loop sample per container without mutating controller data', async () => {
        const {default: LoopContainerController} = await import('@/comps/loop-container/LoopContainerController.ts');
        const controller = new LoopContainerController();
        controller.config = {
            base: {id: 'loop-a', type: 'LoopContainer'},
            data: {
                sourceType: 'static',
                value: [{name: 'row-1'}, {name: 'row-2'}],
            },
        } as any;

        const result = controller.seedEditSampleData();

        expect(result).toBe(true);
        expect(loopContainerSampleDataStore.getSampleData('loop-a')).toEqual({name: 'row-1'});
        expect(controller.config.data.value).toEqual([{name: 'row-1'}, {name: 'row-2'}]);
    });

    it('keeps nested loop samples isolated by container id', async () => {
        const {default: LoopContainerController} = await import('@/comps/loop-container/LoopContainerController.ts');

        const controllerA = new LoopContainerController();
        controllerA.config = {
            base: {id: 'loop-a', type: 'LoopContainer'},
            data: {
                sourceType: 'static',
                value: [{name: 'row-a'}],
            },
        } as any;
        controllerA.seedEditSampleData();

        const controllerB = new LoopContainerController();
        controllerB.config = {
            base: {id: 'loop-b', type: 'LoopContainer'},
            data: {
                sourceType: 'static',
                value: [{name: 'row-b'}],
            },
        } as any;
        controllerB.seedEditSampleData();

        const sampleA = loopContainerSampleDataStore.getSampleData<any>('loop-a');
        const sampleB = loopContainerSampleDataStore.getSampleData<any>('loop-b');

        expect(sampleA).toEqual({name: 'row-a'});
        expect(sampleB).toEqual({name: 'row-b'});

        sampleA.name = 'mutated';
        expect(loopContainerSampleDataStore.getSampleData('loop-a')).toEqual({name: 'row-a'});
    });

    it('clears the stored sample when the loop data is empty', async () => {
        const {default: LoopContainerController} = await import('@/comps/loop-container/LoopContainerController.ts');
        const controller = new LoopContainerController();
        controller.config = {
            base: {id: 'loop-empty', type: 'LoopContainer'},
            data: {
                sourceType: 'static',
                value: [],
            },
        } as any;

        const result = controller.seedEditSampleData();

        expect(result).toBe(false);
        expect(loopContainerSampleDataStore.getSampleData('loop-empty')).toBeUndefined();
    });

    it('prefills static drafts from the stored sample when the config has no value yet', () => {
        const sample = {name: 'sample-row', tags: ['a']};

        const draft = resolveInitialStaticData({filter: 'function filter(data) { return data; }'}, {draftValue: sample});
        expect(draft.value).toEqual(sample);
        expect(draft.filter).toBe('function filter(data) { return data; }');

        if (draft.value && typeof draft.value === 'object')
            (draft.value as any).name = 'changed';
        expect(sample).toEqual({name: 'sample-row', tags: ['a']});
    });

    it('prefers the draft value over the config value when present', () => {
        const sample = {name: 'sample-row'};

        const draft = resolveInitialStaticData({value: {name: 'configured-row'}, filter: null}, {draftValue: sample});

        expect(draft.value).toEqual({name: 'sample-row'});
        expect(draft.filter).toBeNull();
    });

    it('keeps the config value over the default value', () => {
        const draft = resolveInitialStaticData(
            {value: {name: 'configured-row'}, filter: null},
            {defaultValue: {name: 'default-row'}}
        );

        expect(draft.value).toEqual({name: 'configured-row'});
        expect(draft.filter).toBeNull();
    });

    it('falls back to the default value when no config value or draft value exists', () => {
        const draft = resolveInitialStaticData(undefined, {defaultValue: {name: 'default-row'}});

        expect(draft.value).toEqual({name: 'default-row'});
        expect(draft.filter).toBeNull();
    });

    it('retries data sync until loop item controllers are mounted', async () => {
        vi.useFakeTimers();
        (window as any).DATAVISOOL_ENV = {
            ...(window as any).DATAVISOOL_ENV,
            mode: '0',
        };
        const {default: LoopContainerController} = await import('@/comps/loop-container/LoopContainerController.ts');
        const controller = new LoopContainerController();
        const changeData = vi.fn();

        controller.config = {
            base: {id: 'loop-a', type: 'LoopContainer'},
            data: {
                sourceType: 'static',
                value: [],
            },
        } as any;
        (controller as any).initialized = true;
        controller.instance = {
            updateConfig: vi.fn(),
            resetCarouselSlots: vi.fn(),
        } as any;
        controller.manager.layerManager.layerConfigs = {
            title: {id: 'title', type: 'BaseText'},
        } as any;

        controller.changeData([{title: 'row-1'}]);

        await vi.advanceTimersByTimeAsync(10);
        expect(changeData).not.toHaveBeenCalled();

        controller.manager.layerManager.controllers.title_0 = {
            config: {
                base: {id: 'title', type: 'BaseText'},
                data: {
                    sourceType: 'static',
                    staticData: {
                        value: {},
                        filter: 'function filter(data) { return data.title; }',
                    },
                },
            },
            changeData,
        } as any;

        await vi.advanceTimersByTimeAsync(50);

        expect(changeData).toHaveBeenCalledWith('row-1');
        vi.useRealTimers();
    });
});
