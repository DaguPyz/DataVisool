/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {describe, expect, it, vi} from 'vitest';
import {DesignerMode, DesignerScene} from '@datavisool/sdk/types';
import type DesignerManager from '@/plugins/designer-runtime/internal/designer/manager/DesignerManager.ts';
import RuntimeDesignerManager from '@/plugins/designer-runtime/internal/designer/manager/DesignerManager.ts';
import BPTask from '@/plugins/designer-runtime/internal/designer/blueprint/core/BPTask.ts';
import {createDesignerBlueprintNodeRegistry} from '@/plugins/designer-runtime/internal/designer/blueprint/node/BlueprintNodeRegistry.ts';
import {
    disposeBlueprintRuntimeResources,
    registerBlueprintRuntimeCleanup,
} from '@/plugins/designer-runtime/internal/designer/blueprint/core/BlueprintRuntimeResources.ts';

describe('blueprint runtime resource cleanup', () => {
    it('releases every manager-owned resource and reports failures after cleanup', () => {
        const manager = {} as DesignerManager;
        const released: string[] = [];
        registerBlueprintRuntimeCleanup(manager, () => released.push('first'));
        registerBlueprintRuntimeCleanup(manager, () => {
            released.push('failed');
            throw new Error('cleanup failed');
        });
        registerBlueprintRuntimeCleanup(manager, () => released.push('last'));

        expect(() => disposeBlueprintRuntimeResources(manager)).toThrow(AggregateError);
        expect(released).toEqual(['last', 'failed', 'first']);
        expect(() => disposeBlueprintRuntimeResources(manager)).not.toThrow();
        expect(released).toEqual(['last', 'failed', 'first']);
    });

    it('invalidates delayed task continuations when its manager is destroyed or reinitialized', () => {
        const manager = new RuntimeDesignerManager(DesignerScene.DEFAULT);
        const input = {
            bluePrintManager: [{
                pageId: 'task-page',
                bpNodeLayoutMap: {},
                bpNodeConfigMap: {},
                bpAPMap: {'trigger:click:1': ['node:execute:0']},
                bpAPLineMap: {}, bpLines: {},
            }],
        };
        manager.init(input, DesignerMode.PREVIEW);
        const execute = vi.fn();
        manager.bluePrintManager.bpPageMangers[0]!.bpNodeControllers.node = {
            isEnabled: () => true, execute, destroy: vi.fn(),
        } as never;
        const task = new BPTask(manager);
        task.run('trigger:click:1', task, manager, null);
        expect(execute).toHaveBeenCalledTimes(1);

        manager.destroy();
        expect(task.isActiveFor(manager)).toBe(false);
        manager.init(input, DesignerMode.PREVIEW);
        const nextExecute = vi.fn();
        manager.bluePrintManager.bpPageMangers[0]!.bpNodeControllers.node = {
            isEnabled: () => true, execute: nextExecute, destroy: vi.fn(),
        } as never;
        task.run('trigger:click:1', task, manager, null);
        expect(nextExecute).not.toHaveBeenCalled();
        manager.destroy();
    });

    it('stops the remaining synchronous path when one node destroys its manager', () => {
        const manager = new RuntimeDesignerManager(DesignerScene.DEFAULT);
        manager.init({
            bluePrintManager: [{
                pageId: 'destroy-during-path',
                bpNodeLayoutMap: {},
                bpNodeConfigMap: {},
                bpAPMap: {'trigger:click:1': ['destroy:run:0', 'after:run:0']},
                bpAPLineMap: {}, bpLines: {},
            }],
        }, DesignerMode.PREVIEW);
        const laterExecute = vi.fn();
        manager.bluePrintManager.bpPageMangers[0]!.bpNodeControllers.destroy = {
            isEnabled: () => true,
            execute: () => manager.destroy(),
            destroy: vi.fn(),
        } as never;
        manager.bluePrintManager.bpPageMangers[0]!.bpNodeControllers.after = {
            isEnabled: () => true, execute: laterExecute, destroy: vi.fn(),
        } as never;

        const task = new BPTask(manager);
        task.run('trigger:click:1', task, manager, null);

        expect(laterExecute).not.toHaveBeenCalled();
    });

    it('creates node defaults from an explicitly bound metadata context', () => {
        let active = true;
        const registry = createDesignerBlueprintNodeRegistry();
        const definition = registry.get('BPLayerNode');
        if (!definition) throw new Error('BPLayerNode factory was not registered.');
        const context = {
            isActive: () => active,
            readNodeInfo: (_type: 'BPLayerNode' | 'BPGlobalVariableNode', nodeId: string) => ({
                id: nodeId, name: '绑定场景图层', type: 'BPLayerNode', input: [], output: [],
            }),
        };
        const controller = definition.createController(undefined, context);
        expect(controller.getNodeInfo('layer-1')).toMatchObject({id: 'layer-1', name: '绑定场景图层'});
        active = false;
        expect(controller.getNodeInfo('layer-1')).toBeNull();
        let rejected: unknown;
        try { definition.createController(undefined, context); } catch (error) { rejected = error; }
        expect(rejected).toMatchObject({name: 'AbortError'});
        controller.destroy();
    });
});
