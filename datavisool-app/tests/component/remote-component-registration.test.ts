/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {afterEach, describe, expect, it, vi} from 'vitest';
import {waitFor} from '@testing-library/react';
import DesignerLoader from '@/designer/loader/DesignerLoader';
import {componentCategorize} from '@/designer/left/compoent-lib/ComponentCategorize';

const {getAllRemoteComponents} = vi.hoisted(() => {
    if (!URL.createObjectURL) Object.defineProperty(URL, 'createObjectURL', {value: () => 'blob:test', configurable: true});
    if (!globalThis.Worker) Object.defineProperty(globalThis, 'Worker', {value: class {
        addEventListener() {} removeEventListener() {} postMessage() {} terminate() {}
    }, configurable: true});
    return {getAllRemoteComponents: vi.fn()};
});

vi.mock('@/designer/manager/DesignerManager.ts', () => ({default: class DesignerManager {}}));
vi.mock('@/designer/left/compoent-lib/ComponentCategorize.ts', () => ({componentCategorize: []}));
vi.mock('@/framework/core/AbstractDesignerDefinition.ts', () => ({default: class AbstractDesignerDefinition {}}));
vi.mock('@/designer/blueprint/util/EventUtil.ts', () => ({default: {}}));
vi.mock('@/api/engineering/BaseApi.ts', () => ({default: {getAllRemoteComponents}}));
vi.mock('@/util/AuthFetchUtil.ts', () => ({default: {}}));

describe('remote component registration', () => {
    afterEach(() => {
        document.querySelectorAll('script[data-id]').forEach(script => script.remove());
        delete window.__DATAVISOOL_REMOTE_COMPONENT_BASE_URL_MAP__;
        window.__DATAVISOOL_REMOTE_COMPONENT_TEMP__ = undefined;
        DesignerLoader.remoteScriptMap = {};
        DesignerLoader.definitionMap = {};
        componentCategorize.length = 0;
        vi.restoreAllMocks();
        getAllRemoteComponents.mockReset();
    });

    it('loads a current component and maps its resource base', async () => {
        const format = 'current';
        const loader = new DesignerLoader();
        const definition = {getBaseInfo: () => ({compKey: 'Example'})};
        const init = vi.spyOn(loader, 'initDefinition').mockImplementation((_entry, callback) => callback?.(definition as any));
        const promise = loader.loadScript({id: format, url: '/static/components/example/index.js'});
        await waitFor(() => expect(document.querySelector(`script[data-id="${format}"]`)).not.toBeNull());
        const script = document.querySelector(`script[data-id="${format}"]`) as HTMLScriptElement;
        expect(script).not.toBeNull();
        const baseUrl = new URL('./', script.src).href;
        expect(window.__DATAVISOOL_REMOTE_COMPONENT_BASE_URL_MAP__?.['index.js']).toBe(baseUrl);
        expect(script.getAttribute('data-datavisool-remote-base-url')).toBe(baseUrl);
        const Entry = class {};
        window.__DATAVISOOL_REMOTE_COMPONENT_TEMP__ = Entry;
        script.dispatchEvent(new Event('load'));
        await expect(promise).resolves.toBeNull();
        expect(init).toHaveBeenCalledWith(Entry, expect.any(Function));
        expect(DesignerLoader.remoteScriptMap.Example.id).toBe(format);
        expect(window.__DATAVISOOL_REMOTE_COMPONENT_TEMP__).toBeUndefined();
    });

    it('rejects a script without a registration and removes it', async () => {
        const loader = new DesignerLoader();
        const promise = loader.loadScript({id: 'missing', url: '/static/components/missing.js'});
        await waitFor(() => expect(document.querySelector('script[data-id="missing"]')).not.toBeNull());
        const script = document.querySelector('script[data-id="missing"]') as HTMLScriptElement;
        script.dispatchEvent(new Event('load'));
        await expect(promise).rejects.toThrow('Remote component not found on window.');
        expect(document.querySelector('script[data-id="missing"]')).toBeNull();
    });

    it('does not mistake a stale registration for the newly loaded script', async () => {
        const loader = new DesignerLoader();
        window.__DATAVISOOL_REMOTE_COMPONENT_TEMP__ = class Stale {} as any;
        const load = loader.loadScript({id: 'stale', url: '/static/components/stale.js'});
        const rejection = expect(load).rejects.toThrow('Remote component not found on window.');
        await waitFor(() => expect(document.querySelector('script[data-id="stale"]')).not.toBeNull());
        expect(window.__DATAVISOOL_REMOTE_COMPONENT_TEMP__).toBeUndefined();
        document.querySelector('script[data-id="stale"]')!.dispatchEvent(new Event('load'));
        await rejection;
        expect(DesignerLoader.remoteScriptMap).toEqual({});
    });

    it('rejects initialization failures without publishing a partial component', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const loader = new DesignerLoader();
        const load = loader.loadScript({id: 'broken-definition', url: '/static/components/broken.js'});
        const rejection = expect(load).rejects.toThrow('subcategory failed');
        await waitFor(() => expect(document.querySelector('script[data-id="broken-definition"]')).not.toBeNull());
        window.__DATAVISOOL_REMOTE_COMPONENT_TEMP__ = class {
            getBaseInfo() { return {compKey: 'Broken'}; }
            getCategorize() { return {key: 'example', name: 'Example', icon: () => null}; }
            getSubCategorize(): never { throw new Error('subcategory failed'); }
        } as any;
        document.querySelector('script[data-id="broken-definition"]')!.dispatchEvent(new Event('load'));
        await rejection;
        expect(DesignerLoader.remoteScriptMap.Broken).toBeUndefined();
        expect(DesignerLoader.definitionMap.Broken).toBeUndefined();
        expect(componentCategorize).toEqual([]);
        expect(document.querySelector('script[data-id="broken-definition"]')).toBeNull();
    });

    it('rejects definitions without a component type', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const loader = new DesignerLoader();
        const load = loader.loadScript({id: 'no-type', url: '/static/components/no-type.js'});
        const rejection = expect(load).rejects.toThrow('组件缺少类型标识');
        await waitFor(() => expect(document.querySelector('script[data-id="no-type"]')).not.toBeNull());
        window.__DATAVISOOL_REMOTE_COMPONENT_TEMP__ = class {getBaseInfo() {return {};}} as any;
        document.querySelector('script[data-id="no-type"]')!.dispatchEvent(new Event('load'));
        await rejection;
        expect(DesignerLoader.remoteScriptMap).toEqual({});
        expect(DesignerLoader.definitionMap).toEqual({});
    });

    it('ignores query and fragment text when mapping the resource base', async () => {
        const loader = new DesignerLoader();
        vi.spyOn(loader, 'initDefinition').mockImplementation((_entry, callback) => callback?.({getBaseInfo: () => ({compKey: 'Query'})} as any));
        const load = loader.loadScript({id: 'query', url: '/static/components/example/index.js?version=/v1#section'});
        await waitFor(() => expect(document.querySelector('script[data-id="query"]')).not.toBeNull());
        const script = document.querySelector('script[data-id="query"]') as HTMLScriptElement;
        expect(window.__DATAVISOOL_REMOTE_COMPONENT_BASE_URL_MAP__?.['index.js']).toBe(new URL('./', script.src).href);
        window.__DATAVISOOL_REMOTE_COMPONENT_TEMP__ = class {};
        script.dispatchEvent(new Event('load'));
        await expect(load).resolves.toBeNull();
    });

    it('serializes simultaneous loads across loaders so identical entry names keep their own resource bases', async () => {
        const first = new DesignerLoader();
        const second = new DesignerLoader();
        for (const loader of [first, second]) {
            vi.spyOn(loader, 'initDefinition').mockImplementation((entry, callback) => callback?.(new entry()));
        }
        const firstLoad = first.loadScript({id: 'first', url: '/static/components/first/index.js'});
        const secondLoad = second.loadScript({id: 'second', url: '/static/components/second/index.js'});
        await waitFor(() => expect(document.querySelector('script[data-id="first"]')).not.toBeNull());
        expect(document.querySelector('script[data-id="second"]')).toBeNull();
        const firstScript = document.querySelector('script[data-id="first"]') as HTMLScriptElement;
        expect(window.__DATAVISOOL_REMOTE_COMPONENT_BASE_URL_MAP__?.['index.js']).toBe(new URL('./', firstScript.src).href);
        window.__DATAVISOOL_REMOTE_COMPONENT_TEMP__ = class {getBaseInfo() {return {compKey: 'First'};}} as any;
        firstScript.dispatchEvent(new Event('load'));
        await firstLoad;

        await waitFor(() => expect(document.querySelector('script[data-id="second"]')).not.toBeNull());
        const secondScript = document.querySelector('script[data-id="second"]') as HTMLScriptElement;
        expect(window.__DATAVISOOL_REMOTE_COMPONENT_BASE_URL_MAP__?.['index.js']).toBe(new URL('./', secondScript.src).href);
        window.__DATAVISOOL_REMOTE_COMPONENT_TEMP__ = class {getBaseInfo() {return {compKey: 'Second'};}} as any;
        secondScript.dispatchEvent(new Event('load'));
        await secondLoad;
        expect(DesignerLoader.remoteScriptMap.First.id).toBe('first');
        expect(DesignerLoader.remoteScriptMap.Second.id).toBe('second');
    });

    it('loads different packages with the same entry filename from relative server paths', async () => {
        getAllRemoteComponents.mockResolvedValue([
            {id: 'one', url: 'static/components/first/index.js'},
            {id: 'two', url: 'static/components/second/index.js'},
        ]);
        const loader = new DesignerLoader();
        vi.spyOn(loader, 'initDefinition').mockImplementation((entry, callback) => callback?.(new entry()));
        const load = loader.loadRemoteComponents();
        await waitFor(() => expect(document.querySelectorAll('script[data-id]')).toHaveLength(1));
        const first = document.querySelector('script[data-id]') as HTMLScriptElement;
        expect(first.src).toContain('/static/components/first/index.js');
        window.__DATAVISOOL_REMOTE_COMPONENT_TEMP__ = class {getBaseInfo() {return {compKey: 'First'};}} as any;
        first.dispatchEvent(new Event('load'));
        await waitFor(() => expect(document.querySelectorAll('script[data-id]')).toHaveLength(2));
        const second = document.querySelectorAll('script[data-id]')[1] as HTMLScriptElement;
        expect(second.src).toContain('/static/components/second/index.js');
        expect(second.dataset.id).not.toBe(first.dataset.id);
        window.__DATAVISOOL_REMOTE_COMPONENT_TEMP__ = class {getBaseInfo() {return {compKey: 'Second'};}} as any;
        second.dispatchEvent(new Event('load'));
        await load;
        expect(Object.keys(DesignerLoader.remoteScriptMap)).toEqual(['First', 'Second']);
    });

    it('normalizes equivalent URLs while distinguishing different external origins', () => {
        const loader = new DesignerLoader();
        const id = (url: string) => (loader as any).getRemoteScriptId(url);
        expect(id('static/components/x/index.js?v=1')).toBe(id('/static/components/x/index.js#fragment'));
        expect(id('https://one.example/static/components/x/index.js')).not.toBe(id('https://two.example/static/components/x/index.js'));
    });

    it('continues the queue after a component fails to load', async () => {
        const loader = new DesignerLoader();
        vi.spyOn(loader, 'initDefinition').mockImplementation((_entry, callback) => callback?.({getBaseInfo: () => ({compKey: 'Next'})} as any));
        const failed = loader.loadScript({id: 'failed', url: '/static/components/failed.js'});
        const failedAssertion = expect(failed).rejects.toThrow('Failed to load script');
        const next = loader.loadScript({id: 'next', url: '/static/components/next.js'});
        await waitFor(() => expect(document.querySelector('script[data-id="failed"]')).not.toBeNull());
        document.querySelector('script[data-id="failed"]')!.dispatchEvent(new Event('error'));
        await failedAssertion;
        await waitFor(() => expect(document.querySelector('script[data-id="next"]')).not.toBeNull());
        window.__DATAVISOOL_REMOTE_COMPONENT_TEMP__ = class {};
        document.querySelector('script[data-id="next"]')!.dispatchEvent(new Event('load'));
        await expect(next).resolves.toBeNull();
        expect(DesignerLoader.remoteScriptMap.Next.id).toBe('next');
    });

    it('retries a simultaneous request for the same component if the first attempt fails', async () => {
        const loader = new DesignerLoader();
        vi.spyOn(loader, 'initDefinition').mockImplementation((_entry, callback) => callback?.({getBaseInfo: () => ({compKey: 'Retried'})} as any));
        const first = loader.loadScript({id: 'retry', url: '/static/components/retry.js'});
        const firstAssertion = expect(first).rejects.toThrow('Failed to load script');
        const second = loader.loadScript({id: 'retry', url: '/static/components/retry.js'});
        await waitFor(() => expect(document.querySelector('script[data-id="retry"]')).not.toBeNull());
        const failedScript = document.querySelector('script[data-id="retry"]')!;
        failedScript.dispatchEvent(new Event('error'));
        await firstAssertion;
        await waitFor(() => {
            expect(document.querySelector('script[data-id="retry"]')).not.toBeNull();
            expect(document.querySelector('script[data-id="retry"]')).not.toBe(failedScript);
        });
        const retryScript = document.querySelector('script[data-id="retry"]');
        expect(retryScript).not.toBeNull();
        window.__DATAVISOOL_REMOTE_COMPONENT_TEMP__ = class {};
        retryScript!.dispatchEvent(new Event('load'));
        await expect(second).resolves.toBeNull();
    });
});
