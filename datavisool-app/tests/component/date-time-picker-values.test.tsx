/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {createRef} from 'react';
import {act, cleanup, fireEvent, render} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import DateTimePickerComponent, {DateTimePickerComponentRef} from '@/comps/builtin/date-time-picker/DateTimePickerComponent.tsx';

afterEach(cleanup);

describe('date and time picker values', () => {
    it('restores a date-time range and preserves the time when a value changes', () => {
        const ref = createRef<DateTimePickerComponentRef>();
        const changed = vi.fn();
        const {container} = render(<DateTimePickerComponent ref={ref} style={{pickerType: 'range', showTime: true}}
            data={{value: ['2026-01-01 08:30:12', '2026-01-02 09:45:23']}} />);
        act(() => ref.current!.setEventHandler({valueChange: changed}));
        const inputs = container.querySelectorAll('input');
        expect(inputs[0]).toHaveValue('2026-01-01T08:30:12.000');
        expect(inputs[1]).toHaveValue('2026-01-02T09:45:23.000');
        fireEvent.change(inputs[0], {target: {value: '2026-01-01T10:20:30'}});
        expect(changed).toHaveBeenCalledWith(['2026-01-01 10:20:30', '2026-01-02 09:45:23']);
        expect(ref.current!.getValue()).toEqual(['2026-01-01 10:20:30', '2026-01-02 09:45:23']);
        expect(inputs[0]).toHaveValue('2026-01-01T10:20:30.000');
    });

    it('restores a selected quarter after it is saved', () => {
        const ref = createRef<DateTimePickerComponentRef>();
        const {container} = render(<DateTimePickerComponent ref={ref} style={{pickerType: 'quarter'}}
            data={{value: '2026-Q2'}} />);
        const input = container.querySelector('input')!;
        expect(input).toHaveValue('2026-04');
        fireEvent.change(input, {target: {value: '2026-10'}});
        expect(ref.current!.getValue()).toBe('2026-Q4');
        expect(input).toHaveValue('2026-10');
    });

    it('uses the ISO week year across a year boundary', () => {
        const {container} = render(<DateTimePickerComponent style={{pickerType: 'week'}}
            data={{value: '2021-01-01'}} />);
        expect(container.querySelector('input')).toHaveValue('2020-W53');
    });

    it('restores dates in the explicitly configured format', () => {
        const {container} = render(<DateTimePickerComponent style={{pickerType: 'date', format: 'DD/MM/YYYY'}}
            data={{value: '31/12/2026'}} />);
        expect(container.querySelector('input')).toHaveValue('2026-12-31');
    });

    it('honors showTime and a custom format for a single date', () => {
        const ref = createRef<DateTimePickerComponentRef>();
        const {container} = render(<DateTimePickerComponent ref={ref}
            style={{pickerType: 'date', showTime: true, format: 'DD/MM/YYYY HH:mm:ss'}}
            data={{value: '31/12/2026 20:15:12'}} />);
        const input = container.querySelector('input')!;
        expect(input.type).toBe('datetime-local');
        expect(input).toHaveValue('2026-12-31T20:15:12.000');
        fireEvent.change(input, {target: {value: '2026-12-31T20:16:13'}});
        expect(ref.current!.getValue()).toBe('31/12/2026 20:16:13');
        expect(input).toHaveValue('2026-12-31T20:16:13.000');
    });
});
