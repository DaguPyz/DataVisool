/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import React, {createRef} from 'react';
import {act, cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {afterEach, beforeAll, expect, it, vi} from 'vitest';

const state = vi.hoisted(() => ({maps: [] as any[]}));
vi.mock('maplibre-gl', () => ({default: {
    setWorkerUrl: vi.fn(),
    Map: class {
        handlers = new Map<string, (...args: any[]) => void>();
        sources = new Map<string, any>();
        layers = new Map<string, any>();
        remove = vi.fn();
        on = vi.fn((event: string, handler: (...args: any[]) => void) => this.handlers.set(event, handler));
        addSource = vi.fn((id: string, spec: any) => this.sources.set(id, {spec, setData: vi.fn()}));
        getSource = vi.fn((id: string) => this.sources.get(id));
        removeSource = vi.fn((id: string) => this.sources.delete(id));
        addLayer = vi.fn((spec: any) => this.layers.set(spec.id, spec));
        getLayer = vi.fn((id: string) => this.layers.get(id));
        removeLayer = vi.fn((id: string) => this.layers.delete(id));
        isStyleLoaded = vi.fn(() => true);
        constructor() { state.maps.push(this); }
        emit(event: string) { this.handlers.get(event)?.(); }
    },
}}));

import MapLibreGisComponent, {type MapLibreGisComponentRef} from '@/comps/maplibre-gis/MapLibreGisComponent';
import MapLibreGisController from '@/comps/maplibre-gis/MapLibreGisController';
import MapLibreGisLayersConfig from '@/comps/maplibre-gis/layer/MapLibreGisLayersConfig';
import MapLibreGisSourcesConfig from '@/comps/maplibre-gis/source/MapLibreGisSourcesConfig';
import {buildMapLibreSourceSpec} from '@/comps/maplibre-gis/source/SourceTools';

const featureCollection = {
    type: 'FeatureCollection',
    features: [{type: 'Feature', geometry: {type: 'Point', coordinates: [121.5, 31.2]}, properties: {population2026: 1200}}],
};

afterEach(() => {
    cleanup();
    state.maps.length = 0;
});

beforeAll(() => {
    if (!Range.prototype.getBoundingClientRect)
        Object.defineProperty(Range.prototype, 'getBoundingClientRect', {configurable: true, value: () => new DOMRect()});
    if (!Range.prototype.getClientRects)
        Object.defineProperty(Range.prototype, 'getClientRects', {configurable: true, value: () => []});
});

it('saves source clustering options and restores the MapLibre source spec', () => {
    const source = {
        id: 'population-source', name: '人口数据', visible: true, sourceType: 'geojson', dataMode: 'dataConfig',
        dataConfig: {sourceType: 'static', staticData: {value: featureCollection}, value: featureCollection},
        cluster: true, clusterRadius: 32, clusterMaxZoom: 12,
    } as any;
    const config: any = {style: {base: {}, sources: [source], layers: []}};
    const update = vi.fn((patch: any) => { config.style = {...config.style, ...patch.style}; });
    const panelController = {getConfig: () => config, update, getMap: () => null};
    const {container} = render(<MapLibreGisSourcesConfig controller={panelController as any}/>);
    fireEvent.click(screen.getByRole('button', {name: '编辑'}));
    const radiusField = [...container.querySelectorAll<HTMLElement>('.mlgis-field')]
        .find(field => field.textContent?.includes('clusterRadius'));
    const radiusInput = radiusField?.querySelector<HTMLInputElement>('input[type="number"]');
    expect(radiusInput).not.toBeNull();
    fireEvent.change(radiusInput!, {target: {value: '48'}});
    fireEvent.click(container.querySelector<HTMLButtonElement>('.mlgis-drawer-save')!);

    expect(update).toHaveBeenCalledWith({style: {sources: expect.arrayContaining([expect.objectContaining({clusterRadius: 48})])}});
    const saved = config.style.sources[0];
    expect(saved).toEqual(expect.objectContaining({cluster: true, clusterRadius: 48, clusterMaxZoom: 12}));
    const restored = JSON.parse(JSON.stringify(saved));
    expect(buildMapLibreSourceSpec(restored)).toEqual(expect.objectContaining({
        type: 'geojson', cluster: true, clusterRadius: 48, clusterMaxZoom: 12,
    }));

    const ref = createRef<MapLibreGisComponentRef>();
    render(<MapLibreGisComponent ref={ref} style={{...config.style, sources: [restored]} as any}/>);
    const map = state.maps[0];
    act(() => map.emit('load'));
    expect(map.addSource).toHaveBeenCalledWith('population-source', expect.objectContaining({
        type: 'geojson', cluster: true, clusterRadius: 48, clusterMaxZoom: 12,
    }));
});

it('saves attribute filters and data-driven styles, restores them, and applies dynamic source data at runtime', async () => {
    const source = {
        id: 'population-source', name: '人口数据', visible: true, sourceType: 'geojson', dataMode: 'dataConfig',
        dataConfig: {sourceType: 'static', staticData: {value: featureCollection}, value: featureCollection},
        cluster: true, clusterRadius: 42, clusterMaxZoom: 12,
    } as any;
    const layer = {
        id: 'population-circles', name: '人口点', visible: true, type: 'circle', sourceRef: source.id,
        filterConfig: {op: 'all', items: [{id: 'pop-check', kind: 'compare', key: 'population', op: 'gte', valueType: 'number', value: 100}]},
        styleConfig: {paint: {'circle-radius': {mode: 'prop_interpolate', property: 'population', stops: [{input: 0, value: 3}, {input: 1000, value: 12}]}}, layout: {}},
    } as any;
    const config: any = {style: {base: {}, sources: [source], layers: [layer]}};
    const update = vi.fn((patch: any) => { config.style = {...config.style, ...patch.style}; });
    const panelController = {getConfig: () => config, update, getMap: () => null};
    const {container} = render(<MapLibreGisLayersConfig controller={panelController as any}/>);
    fireEvent.click(screen.getByRole('button', {name: '编辑'}));
    const propertyInputs = container.querySelectorAll<HTMLInputElement>('input[placeholder="属性名"]');
    expect(propertyInputs).toHaveLength(2);
    fireEvent.change(propertyInputs[0], {target: {value: 'population2026'}});
    fireEvent.change(propertyInputs[1], {target: {value: 'population2026'}});
    fireEvent.click(screen.getByRole('button', {name: '保存'}));

    expect(update).toHaveBeenCalledWith({style: {layers: expect.arrayContaining([expect.objectContaining({
        id: 'population-circles', filter: ['all', ['>=', ['get', 'population2026'], 100]],
    })])}});
    const savedLayer = config.style.layers[0];
    expect(savedLayer.filter).toEqual(['all', ['>=', ['get', 'population2026'], 100]]);
    expect(savedLayer.paint['circle-radius']).toEqual(['interpolate', ['linear'], ['get', 'population2026'], 0, 3, 1000, 12]);
    const style = JSON.parse(JSON.stringify(config.style));

    const ref = createRef<MapLibreGisComponentRef>();
    render(<MapLibreGisComponent ref={ref} style={style as any}/>);
    const map = state.maps[0];
    act(() => map.emit('load'));
    expect(map.addLayer).toHaveBeenCalledWith(expect.objectContaining({
        id: 'population-circles', source: 'population-source', type: 'circle',
        filter: ['all', ['>=', ['get', 'population2026'], 100]],
        paint: expect.objectContaining({'circle-radius': ['interpolate', ['linear'], ['get', 'population2026'], 0, 3, 1000, 12]}),
    }), undefined);

    const controller = new MapLibreGisController();
    (controller as any).instance = {getMap: () => map};
    (controller as any).container = document.createElement('div');
    controller.update({style} as any);
    act(() => controller.loadComponentData());
    await waitFor(() => {
        const runtimeSource = map.getSource('population-source');
        expect(runtimeSource.setData).toHaveBeenCalledWith(featureCollection);
    });
    controller.destroy();
});
