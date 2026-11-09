/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {afterEach, describe, expect, it, vi} from 'vitest';
import {waitFor} from '@testing-library/react';

const {invoke, loadTauriModule} = vi.hoisted(() => ({invoke: vi.fn(), loadTauriModule: vi.fn()}));
vi.mock('@/util/TauriCompatUtil.ts', () => ({loadTauriModule}));
import {openDevTools} from '@/util/DevToolsUtil.ts';

describe('open developer tools', () => {
    afterEach(() => {
        delete (window as any).__TAURI_INTERNALS__;
        vi.clearAllMocks();
    });

    it('does nothing in a browser', () => {
        delete (window as any).__TAURI_INTERNALS__;
        openDevTools();
        expect(loadTauriModule).not.toHaveBeenCalled();
    });

    it('uses the command registered by DataVisool Desktop', async () => {
        (window as any).__TAURI_INTERNALS__ = {};
        loadTauriModule.mockResolvedValue({invoke});
        invoke.mockResolvedValue(undefined);
        openDevTools();
        await waitFor(() => expect(invoke).toHaveBeenCalledWith('datavisool_open_devtools'));
    });
});
