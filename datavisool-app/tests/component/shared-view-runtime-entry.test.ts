/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {afterEach, describe, expect, it, vi} from 'vitest';

describe('preview and release component runtime entry', () => {
    afterEach(() => {
        delete (window as any).DataVisoolSDK;
        delete (window as any).DataVisoolTypes;
        delete (window as any).DataVisoolUI;
    });

    it('initializes the shared runtime without loading the editor entry', async () => {
        vi.resetModules();
        await import('@/global/ExportViewGlobalMember');
        expect(window.DataVisoolSDK.AbstractDesignerController).toBeTypeOf('function');
        expect(window.DataVisoolSDK.ComponentUtil.createAndRender).toBeTypeOf('function');
        expect(window.DataVisoolUI.Button).toBeTypeOf('function');
        expect(window.DataVisoolTypes.DesignerMode.PREVIEW).toBeDefined();
        expect(window.ReactDOM.createRoot).toBeTypeOf('function');
        expect((window as any).LightChaserInterface).toBeUndefined();
        expect((window as any).LightChaserUtil).toBeUndefined();
    });
});
