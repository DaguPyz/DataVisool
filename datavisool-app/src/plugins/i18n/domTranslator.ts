/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import type {I18nService} from '@datavisool/sdk/plugin/contracts/i18n';
import {hasHan} from './translate.ts';

const skipSelector = '[data-datavisool-i18n-skip="true"], script, style, textarea, code, pre';
const translatedAttributes = ['title', 'placeholder', 'aria-label'];

export function createDomTranslator(browser: Window & typeof globalThis, i18n: I18nService) {
    const {document} = browser;
    const originalLang = document.documentElement.getAttribute('lang');
    const originalTextByNode = new WeakMap<Text, string>();
    let observer: MutationObserver | undefined;
    let pending: number | undefined;

    const translateTextNode = (node: Text) => {
        if (!node.parentElement || node.parentElement.closest(skipSelector)) return;
        const currentText = node.nodeValue ?? '';
        const existingSource = originalTextByNode.get(node);
        if (hasHan(currentText) && currentText !== existingSource) originalTextByNode.set(node, currentText);

        const source = originalTextByNode.get(node);
        if (!source) return;
        const nextText = i18n.translate(source);
        if (node.nodeValue !== nextText) node.nodeValue = nextText;
    };

    const translateElementAttrs = (element: Element) => {
        if (element.closest(skipSelector)) return;
        for (const attr of translatedAttributes) {
            const current = element.getAttribute(attr);
            if (!current) continue;
            const dataAttr = 'data-datavisool-i18n-source-' + attr;
            let source = element.getAttribute(dataAttr);
            if (hasHan(current) && current !== source) {
                source = current;
                element.setAttribute(dataAttr, current);
            }
            if (!source) continue;
            const nextAttr = i18n.translate(source);
            if (current !== nextAttr) element.setAttribute(attr, nextAttr);
        }
    };

    const translateDom = (root: ParentNode = document) => {
        if (!observer) return;
        const walker = document.createTreeWalker(root, browser.NodeFilter.SHOW_TEXT);
        for (let current = walker.nextNode(); current; current = walker.nextNode()) {
            translateTextNode(current as Text);
        }
        if (root instanceof browser.Element) translateElementAttrs(root);
        root.querySelectorAll('[title], [placeholder], [aria-label]').forEach(translateElementAttrs);
    };

    const refresh = () => {
        if (!observer) return;
        document.documentElement.lang = i18n.getLocale();
        if (pending !== undefined) return;
        pending = browser.setTimeout(() => {
            pending = undefined;
            translateDom();
        }, 0);
    };

    return {
        refresh,
        translateDom,
        start() {
            if (observer) return;
            observer = new browser.MutationObserver(mutations => {
                for (const mutation of mutations) {
                    for (const node of mutation.addedNodes) {
                        if (node instanceof browser.Text) translateTextNode(node);
                        if (node instanceof browser.Element) translateDom(node);
                    }
                    if (mutation.type === 'characterData' && mutation.target instanceof browser.Text) {
                        translateTextNode(mutation.target);
                    }
                    if (mutation.type === 'attributes' && mutation.target instanceof browser.Element) {
                        translateElementAttrs(mutation.target);
                    }
                }
            });
            observer.observe(document.documentElement, {
                childList: true,
                subtree: true,
                characterData: true,
                attributes: true,
                attributeFilter: translatedAttributes,
            });
            refresh();
        },
        dispose() {
            observer?.disconnect();
            observer = undefined;
            if (pending !== undefined) browser.clearTimeout(pending);
            pending = undefined;
            if (document.documentElement.lang === i18n.getLocale()) {
                if (originalLang === null) document.documentElement.removeAttribute('lang');
                else document.documentElement.lang = originalLang;
            }
        },
    };
}
