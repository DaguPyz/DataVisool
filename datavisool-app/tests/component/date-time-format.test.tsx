/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {createRef, StrictMode} from 'react';
import {act, cleanup, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import DateTimeComponent, {DateTimeComponentRef, FormatType} from '@/comps/builtin/date-time/DateTimeComponent.tsx';

afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

describe('DateTimeComponent', () => {
    it('updates the format immediately and keeps using it as the clock advances', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 10, 3, 10, 20, 30));
        const ref = createRef<DateTimeComponentRef>();
        render(<DateTimeComponent ref={ref} style={{formatType: FormatType.DASH}} />);
        expect(screen.getByText('2026-11-03 10:20:30')).toBeInTheDocument();

        act(() => ref.current!.updateConfig({style: {formatType: FormatType.SLASH}}));
        expect(screen.getByText('2026/11/03 10:20:30')).toBeInTheDocument();
        act(() => vi.advanceTimersByTime(1000));
        expect(screen.getByText('2026/11/03 10:20:31')).toBeInTheDocument();
    });

    it('clears the active timer on unmount, including in StrictMode', () => {
        vi.useFakeTimers();
        const {unmount} = render(<StrictMode><DateTimeComponent /></StrictMode>);
        expect(vi.getTimerCount()).toBe(1);
        unmount();
        expect(vi.getTimerCount()).toBe(0);
    });
});
