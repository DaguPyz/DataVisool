/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import './HelloWorldPage.css';

export interface HelloWorldPageOptions {
    title?: string;
    subtitle?: string;
}

const DEFAULT_TITLE = 'DataVisool Interaction Engine';
const DEFAULT_SUBTITLE = 'Hello world. Interaction engine scaffold is ready.';

function createTextElement(tagName: keyof HTMLElementTagNameMap, className: string, text: string) {
    const element = document.createElement(tagName);
    element.className = className;
    element.textContent = text;
    return element;
}

export function createHelloWorldPage(options: HelloWorldPageOptions = {}) {
    const {title = DEFAULT_TITLE, subtitle = DEFAULT_SUBTITLE} = options;
    const root = document.createElement('main');
    root.className = 'datavisool-interaction-hello';
    root.dataset.testid = 'datavisool-interaction-hello';

    const panel = document.createElement('section');
    panel.className = 'datavisool-interaction-hello__panel';

    const eyebrow = createTextElement('p', 'datavisool-interaction-hello__eyebrow', 'DataVisool');
    const heading = createTextElement('h1', '', title);
    const description = createTextElement('p', 'datavisool-interaction-hello__subtitle', subtitle);

    panel.append(eyebrow, heading, description);
    root.append(panel);

    return root;
}

export function renderHelloWorldPage(container: HTMLElement, options: HelloWorldPageOptions = {}) {
    container.replaceChildren(createHelloWorldPage(options));
}
