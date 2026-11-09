/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import React, {StrictMode, useEffect} from 'react';
import {act, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import ComponentUtil from '@/util/ComponentUtil';

vi.mock('@/designer/loader/DesignerLoader', () => ({default: {bpControllerMap: {}}}));

import DesignerLoader from '@/designer/loader/DesignerLoader';
import {BPNodeContainer} from '@/designer/blueprint/node/core/node-container/BPNodeContainer';

describe('blueprint node rendering lifecycle', () => {
    const previousEnvironment = window.DATAVISOOL_ENV;

    afterEach(() => {
        window.DATAVISOOL_ENV = previousEnvironment;
    });

    it('releases the SDK root on removal without losing it during strict-mode remount', async () => {
        const dispose = vi.fn();
        const Node = () => {
            useEffect(() => () => dispose(), []);
            return <span>Test node</span>;
        };
        class TestController {
            config: any;
            getNodeInfo() { return {name: 'Test node', input: [], output: []}; }
            getConfig() { return this.config; }
            create(container: HTMLElement, config: any) {
                this.config = config;
                return ComponentUtil.createAndRender(container, Node as never);
            }
        }
        DesignerLoader.bpControllerMap.test = TestController as never;
        const manager = {currPageNodeControllers: {}, currentPageManager: {bpNodeConfigMap: {}, bpAPMap: {}}};
        window.DATAVISOOL_ENV = {currentManager: {bluePrintManager: manager}} as typeof window.DATAVISOOL_ENV;
        const layout = {id: 'test-node', type: 'test', position: {x: 0, y: 0}};

        const view = render(<StrictMode><BPNodeContainer layout={layout}/></StrictMode>);
        await screen.findByText('Test node');
        expect(dispose).not.toHaveBeenCalled();

        await act(async () => { view.unmount(); });
        expect(dispose).toHaveBeenCalledOnce();
        expect(manager.currPageNodeControllers).toHaveProperty('test-node');
        delete DesignerLoader.bpControllerMap.test;
    });
});
