/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {waitFor} from '@testing-library/react';
import {DesignerMode} from '@datavisool/sdk/types';

vi.hoisted(() => {
    if (!URL.createObjectURL) Object.defineProperty(URL, 'createObjectURL', {value: () => 'blob:test', configurable: true});
    if (!globalThis.Worker) Object.defineProperty(globalThis, 'Worker', {value: class {
        addEventListener() {}
        removeEventListener() {}
        postMessage() {}
        terminate() {}
    }, configurable: true});
});

import DesignerLoader from '@/plugins/designer-runtime/internal/designer/loader/DesignerLoader.ts';
import DesignerRuntimeContext from '@/plugins/designer-runtime/internal/DesignerRuntimeContext.ts';

const contexts: DesignerRuntimeContext[] = [];
const loaders: DesignerLoader[] = [];
let baseUrlMapDescriptor: PropertyDescriptor | undefined;
let registrationDescriptor: PropertyDescriptor | undefined;
const previousBaseUrl = '/existing-package-assets/';

function createLoader(context: DesignerRuntimeContext): DesignerLoader {
    const loader = new DesignerLoader(DesignerMode.EDIT, context);
    vi.spyOn(loader, 'initDefinition').mockImplementation((Definition, callback) => {
        callback?.(new Definition() as never);
    });
    loaders.push(loader);
    return loader;
}

async function loadRemoteScript(loader: DesignerLoader, id: string, directory: string, compKey: string): Promise<HTMLScriptElement> {
    const pending = loader.loadScript({id, url: `/static/components/${directory}/index.js`});
    await waitFor(() => expect(document.querySelector(`script[data-id="${id}"]`)).not.toBeNull());
    const script = document.querySelector(`script[data-id="${id}"]`) as HTMLScriptElement;
    window.__DATAVISOOL_REMOTE_COMPONENT_TEMP__ = class {
        getBaseInfo() { return {compKey}; }
    } as never;
    script.dispatchEvent(new Event('load'));
    await expect(pending).resolves.toBeNull();
    return script;
}

describe('runtime remote resource mapping ownership', () => {
    beforeEach(() => {
        baseUrlMapDescriptor = Object.getOwnPropertyDescriptor(window, '__DATAVISOOL_REMOTE_COMPONENT_BASE_URL_MAP__');
        registrationDescriptor = Object.getOwnPropertyDescriptor(window, '__DATAVISOOL_REMOTE_COMPONENT_TEMP__');
        window.__DATAVISOOL_REMOTE_COMPONENT_BASE_URL_MAP__ = {'index.js': previousBaseUrl};
        window.__DATAVISOOL_REMOTE_COMPONENT_TEMP__ = undefined;
    });

    afterEach(() => {
        loaders.splice(0).reverse().forEach(loader => {
            try { loader.cancelLoad(); } catch { /* Preserve the test assertion and clean remaining owners. */ }
        });
        contexts.splice(0).reverse().forEach(context => {
            try { context.dispose(); } catch { /* Keep cleanup independent across test activations. */ }
        });
        document.querySelectorAll('script[data-id]').forEach(script => script.remove());
        if (baseUrlMapDescriptor)
            Object.defineProperty(window, '__DATAVISOOL_REMOTE_COMPONENT_BASE_URL_MAP__', baseUrlMapDescriptor);
        else
            Reflect.deleteProperty(window, '__DATAVISOOL_REMOTE_COMPONENT_BASE_URL_MAP__');
        if (registrationDescriptor)
            Object.defineProperty(window, '__DATAVISOOL_REMOTE_COMPONENT_TEMP__', registrationDescriptor);
        else
            Reflect.deleteProperty(window, '__DATAVISOOL_REMOTE_COMPONENT_TEMP__');
        vi.restoreAllMocks();
    });

    it('keeps the surviving loader mapping and restores the preexisting value in either cancel order', async () => {
        const context = new DesignerRuntimeContext();
        contexts.push(context);
        const first = createLoader(context);
        const second = createLoader(context);

        const firstScript = await loadRemoteScript(first, 'resource-first-a', 'first-a', 'ResourceFirstA');
        const secondScript = await loadRemoteScript(second, 'resource-second-a', 'second-a', 'ResourceSecondA');
        const firstBase = new URL('./', firstScript.src).href;
        const secondBase = new URL('./', secondScript.src).href;
        expect(window.__DATAVISOOL_REMOTE_COMPONENT_BASE_URL_MAP__?.['index.js']).toBe(secondBase);

        first.cancelLoad();
        expect(window.__DATAVISOOL_REMOTE_COMPONENT_BASE_URL_MAP__?.['index.js']).toBe(secondBase);
        second.cancelLoad();
        expect(window.__DATAVISOOL_REMOTE_COMPONENT_BASE_URL_MAP__?.['index.js']).toBe(previousBaseUrl);

        const firstScriptAgain = await loadRemoteScript(first, 'resource-first-b', 'first-b', 'ResourceFirstB');
        const secondScriptAgain = await loadRemoteScript(second, 'resource-second-b', 'second-b', 'ResourceSecondB');
        const firstBaseAgain = new URL('./', firstScriptAgain.src).href;
        const secondBaseAgain = new URL('./', secondScriptAgain.src).href;
        expect(window.__DATAVISOOL_REMOTE_COMPONENT_BASE_URL_MAP__?.['index.js']).toBe(secondBaseAgain);

        second.cancelLoad();
        expect(window.__DATAVISOOL_REMOTE_COMPONENT_BASE_URL_MAP__?.['index.js']).toBe(firstBaseAgain);
        const activeBase = window.__DATAVISOOL_REMOTE_COMPONENT_BASE_URL_MAP__?.['index.js'];
        expect(activeBase).toBeDefined();
        expect(new URL('chart.png', activeBase!).href)
            .toBe(new URL('./chart.png', firstScriptAgain.src).href);
        first.cancelLoad();
        expect(window.__DATAVISOOL_REMOTE_COMPONENT_BASE_URL_MAP__?.['index.js']).toBe(previousBaseUrl);

        // Keep both resolved bases in the assertion set so the fixtures prove different directories.
        expect(firstBase).not.toBe(secondBase);
        expect(firstBaseAgain).not.toBe(secondBaseAgain);
    });
});
