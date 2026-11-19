/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {expect, test, type Page} from '@playwright/test';

const projectData = {canvasManager: {width: 840, height: 480, adaptationType: 'none'}};

test.beforeEach(async ({page}) => {
    await page.addInitScript(() => {
        localStorage.setItem('datavisool-i18n-locale', 'zh-CN');
        localStorage.setItem('DATAVISOOL_USER_INFO', JSON.stringify({
            id: 'catalog-fixture', username: 'tester', name: 'Test User', token: 'fixture-token', roles: ['ROLE_USER'],
        }));
    });
    await page.route(url => url.pathname.startsWith('/api/'), route => {
        const {pathname} = new URL(route.request().url());
        const data = pathname.startsWith('/api/project/getProjectData/')
            ? {id: pathname.split('/').at(-1), name: '组件目录项目', dataJson: JSON.stringify(projectData)}
            : [];
        return route.fulfill({json: {code: 200, msg: '', data}});
    });
});

async function openEditor(page: Page) {
    await page.goto('/designer?id=catalog-fixture');
    await expect(page.locator('#designer-ds-content')).toBeVisible({timeout: 20_000});
}

test('公开运行时目录只提供元数据，配置工厂每次返回独立数据', async ({page}) => {
    await openEditor(page);

    const result = await page.evaluate(async () => {
        const {startApplication} = await import(/* @vite-ignore */ '/src/bootstrap/startApplication.ts');
        const application = await startApplication();
        const catalog = await application.get('designerCatalog').prepare();
        const categories = catalog.listCategories();
        const subCategories = catalog.listSubCategories();
        const oldCategoryName = categories[0]?.name;
        const categoryChanged = Reflect.set(categories[0], 'name', '被外部改写');
        const image = catalog.getComponent('BaseImage');
        if (!image) throw new Error('BaseImage is missing from the runtime catalog.');

        const documentation = image.aiDocumentation;
        if (!documentation) throw new Error('BaseImage AI documentation metadata is missing.');
        const documentBefore = JSON.stringify(documentation);
        const documentationChanged = Reflect.set(documentation, 'componentType', 'external-change');
        const documentInfoChanged = Reflect.set(documentation.componentInfo, 'componentName', 'external-change');
        const rereadDocumentation = catalog.getComponent('BaseImage')?.aiDocumentation;
        const metadataKeys = Object.keys(image).sort();
        const changed = Reflect.set(image.baseInfo, 'compName', '被外部改写');
        const rereadName = catalog.getComponent('BaseImage')?.baseInfo.compName;
        const first = catalog.createInitialConfig('BaseImage');
        const second = catalog.createInitialConfig('BaseImage');
        if (!first || !second) throw new Error('BaseImage initial config is missing.');
        const firstStyle = first.style as Record<string, unknown>;
        const secondStyle = second.style as Record<string, unknown>;
        firstStyle.localUrl = 'changed-only-in-first-copy';

        return {
            count: catalog.listComponents().length,
            categoryChanged,
            categoryNamePreserved: catalog.listCategories()[0]?.name === oldCategoryName,
            categoryCount: categories.length,
            subCategoryCount: subCategories.length,
            metadataKeys,
            documentationChanged,
            documentInfoChanged,
            documentationType: documentation.componentType,
            documentationPreserved: JSON.stringify(rereadDocumentation) === documentBefore,
            documentationIsDetached: documentation !== rereadDocumentation && documentation.componentInfo !== rereadDocumentation?.componentInfo,
            changed,
            rereadName,
            initialConfigsAreIndependent: first !== second && secondStyle.localUrl !== 'changed-only-in-first-copy',
            hasDefinitionMethods: Object.keys(image).some(key => typeof (image as Record<string, unknown>)[key] === 'function'),
        };
    });

    expect(result.count).toBeGreaterThan(0);
    expect(result.categoryCount).toBeGreaterThan(0);
    expect(result.subCategoryCount).toBeGreaterThan(0);
    expect(result.categoryChanged).toBe(false);
    expect(result.categoryNamePreserved).toBe(true);
    expect(result.metadataKeys).toEqual(['aiDocumentation', 'baseInfo', 'chartImage', 'key']);
    expect(result.documentationChanged).toBe(false);
    expect(result.documentInfoChanged).toBe(false);
    expect(result.documentationType).toBe('BaseImage');
    expect(result.documentationPreserved).toBe(true);
    expect(result.documentationIsDetached).toBe(true);
    expect(result.changed).toBe(false);
    expect(result.rereadName).toBe('基础图片');
    expect(result.initialConfigsAreIndependent).toBe(true);
    expect(result.hasDefinitionMethods).toBe(false);
});
