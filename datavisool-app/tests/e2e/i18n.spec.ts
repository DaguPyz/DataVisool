/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {expect, test} from '@playwright/test';

test.beforeEach(async ({page}) => {
    await page.addInitScript(() => {
        const key = 'datavisool-i18n-locale';
        if (!localStorage.getItem(key)) localStorage.setItem(key, 'zh-CN');
        localStorage.setItem('DATAVISOOL_USER_INFO', JSON.stringify({
            id: 'i18n-fixture', username: 'tester', name: 'Test User', token: 'fixture-token', roles: ['ROLE_USER'],
        }));
    });
    await page.route('**/static/logo/**', route => route.fulfill({status: 404}));
    await page.route(url => url.pathname.startsWith('/api/'), route => route.fulfill({
        json: {code: 200, msg: '', data: null},
    }));
});

test('设置切换语言后，导航、设计器独立组件与旧 DOM 同步更新', async ({page}) => {
    await page.goto('/home/setting');
    const settingsMenu = page.locator('[class*="navCard"]');
    await settingsMenu.getByText('通用', {exact: true}).click();

    await page.evaluate(async () => {
        const runtimeModule = '/src/plugins/designer-runtime/internal/legacy-global/ComponentRuntime.ts';
        const {componentSdk, componentUI, exportComponentRuntime} = await import(/* @vite-ignore */ runtimeModule);
        exportComponentRuntime();

        const root = document.createElement('div');
        root.id = 'i18n-independent-root';
        root.setAttribute('data-datavisool-i18n-skip', 'true');
        document.body.append(root);
        const Consumer = () => {
            const {locale, translate} = componentUI.useDataVisoolUI();
            return window.React.createElement('output', null, `${locale}: ${translate?.('保存')}`);
        };
        await componentSdk.ComponentUtil.createAndRender(root, Consumer);

        const legacy = document.createElement('button');
        legacy.id = 'i18n-legacy-dom';
        legacy.textContent = '选择工具';
        legacy.title = '保存';
        legacy.setAttribute('aria-label', '选择工具');
        document.body.append(legacy);
        const project = document.createElement('span');
        project.id = 'i18n-project-name';
        project.setAttribute('data-datavisool-i18n-skip', 'true');
        project.textContent = '保存';
        document.body.append(project);
    });

    const root = page.locator('#i18n-independent-root');
    const legacy = page.locator('#i18n-legacy-dom');
    const select = page.locator('[class*="contentCard"]').getByRole('combobox');
    await expect(root).toHaveText('zh-CN: 保存');

    await select.click();
    await page.getByRole('option', {name: 'English', exact: true}).click();
    await expect(page.getByText('Interface language', {exact: true})).toBeVisible();
    await expect(page.locator('.home-primary-menu').getByRole('menuitem', {name: 'Console', exact: true})).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en-US');
    await expect(root).toHaveText('en-US: Save');
    await expect(legacy).toHaveText('Select tool');
    await expect(legacy).toHaveAttribute('title', 'Save');
    await expect(legacy).toHaveAttribute('aria-label', 'Select tool');
    await expect(page.locator('#i18n-project-name')).toHaveText('保存');

    await select.click();
    await page.getByRole('option', {name: 'Simplified Chinese', exact: true}).click();
    await expect(root).toHaveText('zh-CN: 保存');
    await expect(legacy).toHaveText('选择工具');
    await expect(legacy).toHaveAttribute('title', '保存');

    await select.click();
    await page.getByRole('option', {name: 'English', exact: true}).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en-US');
    await page.reload();
    await settingsMenu.getByText('General', {exact: true}).click();
    await expect(page.getByText('Interface language', {exact: true})).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en-US');
});

test('停用应用后撤销国际化和 DOM 观察器，保留语言偏好', async ({page}) => {
    await page.goto('/home/setting');
    const state = await page.evaluate(async () => {
        const appModule = '/src/bootstrap/startApplication.ts';
        const {startApplication} = await import(/* @vite-ignore */ appModule);
        const runtime = await startApplication();
        const legacyApi = window.lcI18n!;
        runtime.get('i18n').setLocale('en-US');
        await runtime.stop();

        const element = document.createElement('div');
        element.textContent = '选择工具';
        element.title = '保存';
        document.body.append(element);
        legacyApi.translateDom();
        legacyApi.setLocale('zh-CN');
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        return {
            text: element.textContent,
            title: element.title,
            legacyApiRemoved: window.lcI18n === undefined,
            storedLocale: localStorage.getItem('datavisool-i18n-locale'),
        };
    });

    expect(state).toEqual({
        text: '选择工具',
        title: '保存',
        legacyApiRemoved: true,
        storedLocale: 'en-US',
    });
});
