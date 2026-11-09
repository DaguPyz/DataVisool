/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {fireEvent, render, screen} from '@testing-library/react';
import {expect, it, vi} from 'vitest';
import {DateTimePickerStyleConfig} from '@/comps/builtin/date-time-picker/DateTimePickerConfig';

it('renders the time-column height once and writes the separate width field', () => {
    window.DATAVISOOL_ENV = {fonts: []} as never;
    const controller = {
        getConfig: () => ({style: {components: {timeColumnHeight: 28, timeColumnWidth: 36}}}),
        update: vi.fn(),
    };
    render(<DateTimePickerStyleConfig controller={controller as never}/>);

    fireEvent.click(screen.getByRole('button', {name: '尺寸布局'}));
    expect(screen.getAllByText('时间列高度', {exact: true})).toHaveLength(1);
    expect(screen.getAllByText('时间列宽度', {exact: true})).toHaveLength(1);
    fireEvent.change(screen.getByDisplayValue('36'), {target: {value: '44'}});

    expect(controller.update).toHaveBeenCalledWith({style: {components: {timeColumnWidth: 44}}});
});
