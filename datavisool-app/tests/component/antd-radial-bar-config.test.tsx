/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {fireEvent, render, screen} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';
import AntdBaseRadialBarStyleConfig from '@/comps/antd/radial-bar-base/AntdBaseRadialBarStyleConfig';

describe('radial bar angle fields', () => {
    it('updates start and end angles independently in radians', () => {
        const controller = {
            getConfig: () => ({style: {
                startAngle: -Math.PI / 2,
                endAngle: Math.PI * 3 / 2,
                color: '#ffffff',
                xAxis: {label: {rotate: 0, offset: 0, style: {fontSize: 12}}},
            }}),
            update: vi.fn(),
        };
        render(<AntdBaseRadialBarStyleConfig controller={controller as never}/>);

        fireEvent.click(screen.getByRole('button', {name: '图形'}));
        expect(screen.getByText('结束角度')).toBeInTheDocument();

        fireEvent.change(screen.getByDisplayValue('270'), {target: {value: '180'}});
        expect(controller.update).toHaveBeenLastCalledWith({style: {endAngle: Math.PI}});

        fireEvent.change(screen.getByDisplayValue('-90'), {target: {value: '0'}});
        expect(controller.update).toHaveBeenLastCalledWith({style: {startAngle: 0}});
    });
});
