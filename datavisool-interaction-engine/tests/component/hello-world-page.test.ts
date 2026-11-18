/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import {afterEach, describe, expect, it} from 'vitest';
import {
    createHelloWorldPage,
    DATAVISOOL_INTERACTION_ENGINE_PACKAGE,
    renderHelloWorldPage,
} from '../../src/main';

afterEach(() => {
    document.body.replaceChildren();
});

describe('datavisool-interaction-engine scaffold', () => {
    it('exports package identity', () => {
        expect(DATAVISOOL_INTERACTION_ENGINE_PACKAGE).toBe('@datavisool/interaction-engine');
    });

    it('creates the hello world page with native DOM APIs', () => {
        const page = createHelloWorldPage();

        expect(page.tagName).toBe('MAIN');
        expect(page.dataset.testid).toBe('datavisool-interaction-hello');
        expect(page.querySelector('h1')?.textContent).toBe('DataVisool Interaction Engine');
        expect(page.textContent).toContain('Hello world. Interaction engine scaffold is ready.');
    });

    it('renders custom page copy into a host container', () => {
        const container = document.createElement('div');
        document.body.append(container);

        renderHelloWorldPage(container, {
            title: 'Native Interaction',
            subtitle: 'Scaffold smoke test.',
        });

        expect(container.children).toHaveLength(1);
        expect(container.querySelector('h1')?.textContent).toBe('Native Interaction');
        expect(container.textContent).toContain('Scaffold smoke test.');
    });
});
