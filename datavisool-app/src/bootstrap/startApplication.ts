/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import logo from '@/images/datavisool-logo.webp';
import {setFavicon} from '@/util/LogoUtil.ts';
import {createAppPlugins} from './appPlugins.ts';
import {createAppRuntime} from './createAppRuntime.ts';
import type {Visloom} from '../visloom/index.ts';

let startup: Promise<Visloom> | undefined;

/** Start the browser application once and mount the view after its plugins are ready. */
export function startApplication(): Promise<Visloom> {
    startup ??= Promise.resolve().then(async () => {
        const container = document.getElementById('root');
        if (!container) throw new Error("Application root '#root' was not found.");

        const runtime = await createAppRuntime(createAppPlugins());
        try {
            const ui = runtime.get('ui');
            setFavicon('/static/logo/logo.png', logo);
            ui.mount(container);
        } catch (error) {
            try {
                await runtime.stop();
            } catch (cleanupError) {
                throw new AggregateError([error, cleanupError], 'DataVisool startup and rollback failed.');
            }
            throw error;
        }
        return runtime;
    });
    return startup;
}

export function showStartupError(error: unknown, locale: string): void {
    console.error('DataVisool failed to start.', error);
    const isChinese = locale === 'zh-CN';
    const notice = document.createElement('main');
    notice.lang = isChinese ? 'zh-CN' : 'en-US';
    notice.setAttribute('role', 'alert');

    const title = document.createElement('h1');
    title.textContent = isChinese ? 'DataVisool 启动失败' : 'DataVisool failed to start';
    const description = document.createElement('p');
    description.textContent = isChinese ? '请重新加载页面后重试。' : 'Reload the page to try again.';
    const reload = document.createElement('button');
    reload.type = 'button';
    reload.textContent = isChinese ? '重新加载' : 'Reload';
    reload.addEventListener('click', () => window.location.reload());
    notice.append(title, description, reload);

    const container = document.getElementById('root');
    if (container) container.replaceChildren(notice);
    else document.body?.append(notice);
}
