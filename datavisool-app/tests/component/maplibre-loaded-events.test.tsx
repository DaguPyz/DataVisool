/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import React, {createRef} from 'react';
import {act, cleanup, render} from '@testing-library/react';
import {afterEach, expect, it, vi} from 'vitest';

const state = vi.hoisted(() => ({maps: [] as any[]}));
vi.mock('maplibre-gl', () => ({default: {
    setWorkerUrl: vi.fn(),
    Map: class {
        handlers: Record<string, (...args: any[]) => void> = {};
        remove = vi.fn();
        constructor() { state.maps.push(this); }
        on(event: string, handler: (...args: any[]) => void) { this.handlers[event] = handler; }
        emit(event: string) { this.handlers[event]?.(); }
    },
}}));

import MapLibreGisComponent, {type MapLibreGisComponentRef} from '@/comps/maplibre-gis/MapLibreGisComponent';

afterEach(() => { cleanup(); state.maps.length = 0; });

it('delivers a map load that occurred before registering the handler and ignores repeated registration', () => {
    const ref = createRef<MapLibreGisComponentRef>();
    render(<MapLibreGisComponent ref={ref} style={{base: {}} as any}/>);
    const map = state.maps[0];
    const loaded = vi.fn();
    act(() => map.emit('load'));
    expect(loaded).not.toHaveBeenCalled();
    act(() => ref.current!.setEventHandler({loaded}));
    act(() => ref.current!.setEventHandler({loaded}));
    expect(loaded).toHaveBeenCalledOnce();
});

it('delivers each newly created map load once and ignores old map callbacks', () => {
    const ref = createRef<MapLibreGisComponentRef>();
    render(<MapLibreGisComponent ref={ref} style={{base: {}} as any}/>);
    const first = state.maps[0];
    const loaded = vi.fn();
    act(() => ref.current!.setEventHandler({loaded}));
    act(() => first.emit('load'));
    expect(loaded).toHaveBeenCalledOnce();
    act(() => ref.current!.recreateMap());
    const second = state.maps[1];
    expect(first.remove).toHaveBeenCalledOnce();
    act(() => first.emit('load'));
    expect(loaded).toHaveBeenCalledOnce();
    act(() => second.emit('load'));
    expect(loaded).toHaveBeenCalledTimes(2);
});
