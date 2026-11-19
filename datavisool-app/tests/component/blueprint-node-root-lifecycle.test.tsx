/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import React, {StrictMode} from 'react';
import {act, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {BPNodeContainer} from '@/plugins/editor-blueprint/node/BPNodeContainer';
import {BlueprintNodeRegistryProvider} from '@/plugins/editor-blueprint/node/BlueprintNodeRegistryContext';
import {EditorBlueprintSessionProvider} from '@/plugins/editor-blueprint/session/EditorBlueprintSessionContext.tsx';
import {createBlueprintSessionFixture} from './support/blueprintSessionFixture.ts';

describe('blueprint node rendering lifecycle', () => {
    let fixture: ReturnType<typeof createBlueprintSessionFixture> | undefined;

    afterEach(() => {
        fixture?.dispose();
        fixture = undefined;
    });

    it('destroys editor-owned node controllers on removal and keeps config through strict-mode remount', async () => {
        const instances: Array<{destroy: ReturnType<typeof vi.fn>; config: any}> = [];
        class TestController {
            config: any = null;
            private listeners = new Set<() => void>();
            destroy = vi.fn(() => {
                this.listeners.clear();
                this.config = null;
            });

            getNodeInfo() { return {name: 'Test node', input: [], output: []}; }
            getConfig() { return this.config; }
            update(config: any) {
                this.config = {...this.config, ...config};
                this.listeners.forEach(listener => listener());
            }
            subscribe(listener: () => void) {
                this.listeners.add(listener);
                return () => { this.listeners.delete(listener); };
            }
        }
        const pageManager = {
            bpNodeConfigMap: {},
            bpAPMap: {},
            bpNodeLayoutMap: {'test-node': {id: 'test-node', type: 'BPGlobalNode', position: {x: 0, y: 0}}},
        };
        const controllerDefinition = {
            type: 'BPGlobalNode',
            createController: () => {
                const controller = new TestController();
                instances.push(controller);
                return controller;
            },
        };
        const registry = {
            get: (type: string) => type === controllerDefinition.type ? controllerDefinition : undefined,
            list: () => [controllerDefinition],
        };
        const layout = pageManager.bpNodeLayoutMap['test-node'];
        fixture = createBlueprintSessionFixture([{pageId: 'page-1', pageName: 'Page 1', ...pageManager}], registry);
        const manager = fixture.session;

        const view = render(<StrictMode>
            <BlueprintNodeRegistryProvider registry={registry as never}>
            <EditorBlueprintSessionProvider value={manager}>
                <BPNodeContainer layout={layout}/>
            </EditorBlueprintSessionProvider>
            </BlueprintNodeRegistryProvider>
        </StrictMode>);
        await screen.findByText('Test node');
        expect(instances.length).toBeGreaterThan(0);
        expect(instances.some(controller => controller.destroy.mock.calls.length === 0)).toBe(true);

        await act(async () => { view.unmount(); });
        for (const controller of instances) expect(controller.destroy).toHaveBeenCalledTimes(1);
        expect(manager.currPageNodeControllers).not.toHaveProperty('test-node');
        expect(fixture.scene.blueprints.read()!.pages[0].bpNodeConfigMap).toHaveProperty('test-node', expect.objectContaining({name: 'Test node', enabled: true}));
    });
});
