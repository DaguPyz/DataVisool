/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import React from 'react';
import {fireEvent, render, screen} from '@testing-library/react';
import {expect, it, vi} from 'vitest';
import {AntdCommonScatterGraphics} from '@/comps/antd-common/scatter/AntdScatterCommonConfig';

it('edits the two ends of a bubble size range without replacing the array', () => {
    const onChange = vi.fn();
    const Harness = () => {
        const [size, setSize] = React.useState<[number, number]>([5, 20]);
        return <AntdCommonScatterGraphics config={{size}} onChange={patch => {
            onChange(patch);
            if (Array.isArray(patch.size)) setSize(patch.size as [number, number]);
        }}/>;
    };
    render(<Harness/>);
    fireEvent.click(screen.getByText('图形'));
    fireEvent.change(screen.getByDisplayValue('5'), {target: {value: '0'}});
    expect(onChange).toHaveBeenLastCalledWith({size: [0, 20]});
    fireEvent.change(screen.getByDisplayValue('20'), {target: {value: '30'}});
    expect(onChange).toHaveBeenLastCalledWith({size: [0, 30]});
});

it('continues to support a fixed numeric scatter size', () => {
    const onChange = vi.fn();
    render(<AntdCommonScatterGraphics config={{size: 4}} onChange={onChange}/>);
    fireEvent.click(screen.getByText('图形'));
    fireEvent.change(screen.getByDisplayValue('4'), {target: {value: '0'}});
    expect(onChange).toHaveBeenLastCalledWith({size: 0});
});
