/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {cleanup, render, screen} from '@testing-library/react';
import {Suspense} from 'react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {AnimationConfig, registerHostConfigPanels} from '@datavisool/sdk/host';
import {createEditorInspectorPlugin} from '@/plugins/editor-inspector/editorInspectorPlugin.tsx';

const disposeAll = (items: Array<() => void>) => items.splice(0).reverse().forEach(dispose => dispose());

describe('editor inspector host panel registration', () => {
    let disposers: Array<() => void> = [];
    afterEach(() => {
        cleanup();
        disposeAll(disposers);
    });

    it('registers local panels for SDK definitions and removes them when the plugin stops', async () => {
        const context = {
            designerRuntime: {
                registerHostConfigPanels,
            },
            editorCanvas: {prepareInspectorDomain: vi.fn()},
            editorShell: {
                nextPanelOpenOrder: () => 1,
                registerSidePanel: () => () => undefined,
                registerView: () => () => undefined,
            },
            onDispose(dispose: () => void) { disposers.push(dispose); },
            onStop: vi.fn(),
            on: () => () => undefined,
        };

        createEditorInspectorPlugin().activate(context as never);
        render(<Suspense fallback="loading"><AnimationConfig controller={{} as never}/></Suspense>);
        expect(await screen.findByText('动画设置')).toBeInTheDocument();

        disposeAll(disposers);
        disposers = [];
        expect(() => AnimationConfig({controller: {} as never})).toThrow('requires the editor host');
    });
});
