/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import React from 'react';
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import NewProjectDialog from '@/pages/home/project-list/NewProjectDialog';

describe('new project shared UI controls', () => {
    afterEach(() => { cleanup(); vi.useRealTimers(); });

    it('keeps valid dimensions when a number field is cleared and submits edited values', () => {
        vi.useFakeTimers();
        const submit = vi.fn();
        render(<NewProjectDialog visible onOk={submit}/>);
        const [width, height] = screen.getAllByRole('spinbutton') as HTMLInputElement[];
        fireEvent.change(width, {target: {value: ''}});
        fireEvent.change(height, {target: {value: ''}});
        expect(width).toHaveValue(1920);
        expect(height).toHaveValue(1080);

        fireEvent.change(screen.getAllByRole('textbox')[0], {target: {value: 'Shared UI test'}});
        fireEvent.change(width, {target: {value: '1280'}});
        fireEvent.change(height, {target: {value: '720'}});
        fireEvent.click(screen.getByRole('button', {name: /创建项目|create project/i}));
        expect(submit).toHaveBeenCalledWith({name: 'Shared UI test', des: '', width: 1280, height: 720});
    });
});
