/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import React from 'react';
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import CanvasHdConfigImpl from '@/plugins/editor-project/canvas/CanvasHdConfigImpl';
import {EditorWorkspaceContext} from '@/shared/designer/EditorWorkspaceContext.ts';


describe('canvas settings shared UI', () => {
    afterEach(cleanup);

    it('keeps valid dimensions on clear and saves edited dimensions', () => {
        const updateCanvasConfig = vi.fn(() => true);
        const scene = {
            version: 1,
            readCanvasConfig: () => ({width: 1920, height: 1080, adaptationType: 'scale'}), updateCanvasConfig,
        };
        render(<EditorWorkspaceContext.Provider value={{readScene: () => scene} as any}>
            <CanvasHdConfigImpl onClose={vi.fn()} canEdit={() => true}/>
        </EditorWorkspaceContext.Provider>);
        const [width, height] = screen.getAllByRole('spinbutton') as HTMLInputElement[];
        fireEvent.change(width, {target: {value: ''}});
        fireEvent.change(height, {target: {value: ''}});
        expect(width).toHaveValue(1920);
        expect(height).toHaveValue(1080);
        fireEvent.change(width, {target: {value: '0'}});
        expect(width).toHaveValue(1);
        fireEvent.change(width, {target: {value: '1280'}});
        fireEvent.change(height, {target: {value: '720'}});
        fireEvent.click(screen.getByRole('button', {name: '确定'}));
        expect(updateCanvasConfig).toHaveBeenCalledWith(expect.objectContaining({width: 1280, height: 720}));
    });
});
