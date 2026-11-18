/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {expect, test} from '@playwright/test';

const quickStart = '/docs/zh-cn/quick_start/quick_start';

test('未登录读者能从文档首页搜索正文、分享章节并放大截图', async ({page}) => {
    await page.setViewportSize({width: 1440, height: 900});
    await page.goto('/docs');
    await expect(page).toHaveURL(/\/docs\/zh-cn$/);
    await expect(page.getByRole('heading', {level: 1})).toContainText('DataVisool');
    await expect(page.getByRole('link', {name: '返回工作台'})).toHaveAttribute('href', '/home/console');
    await page.getByRole('button', {name: '搜索文档'}).click();
    await page.getByRole('searchbox', {name: '搜索文档'}).fill('1920');
    const hit = page.getByRole('dialog').getByRole('link').filter({hasText: '快速开始'}).first();
    await expect(hit).toHaveAttribute('href', /quick_start\/quick_start#.+/);
    await hit.click();
    const url = new URL(page.url());
    expect(url.pathname).toBe(quickStart);
    await page.reload();
    await expect(page.getByRole('heading', {name: '快速开始', exact: true})).toBeVisible();
    await expect.poll(() => page.evaluate(() => {
        const title = document.getElementById(decodeURIComponent(location.hash.slice(1)));
        const top = title?.getBoundingClientRect().top ?? Infinity;
        return top >= 0 && top < innerHeight / 2;
    })).toBe(true);

    const screenshot = page.locator('main img').first();
    await screenshot.click();
    await expect(page.getByRole('dialog').locator('img')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('手机目录支持换页和页内跳转', async ({page}) => {
    await page.setViewportSize({width: 390, height: 844});
    await page.goto('/docs');
    await page.getByRole('button', {name: /^目录/}).click();
    await page.getByRole('dialog').getByRole('link', {name: '快速开始', exact: true}).click();
    await expect(page).toHaveURL(new RegExp(quickStart + '$'));
    await expect(page.getByRole('heading', {name: '快速开始', exact: true})).toBeVisible();
    await page.getByRole('button', {name: /^目录/}).click();
    await page.getByRole('dialog').getByRole('navigation', {name: '本页目录'}).getByRole('link').last().click();
    await expect(page).toHaveURL(/quick_start#.+/);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('旧文档地址跳转到新文档', async ({page}) => {
    for (const [oldUrl, destination] of [
        ['/docs/#/deploy/windows常规部署/windows常规部署.md?id=_2-部署步骤', '/docs/zh-cn/deploy/web/windows'],
        ['/docs/archive/deploy/docker部署/Docker部署', '/docs/zh-cn/deploy/web/docker'],
        ['/docs/#/log/log', '/docs/zh-cn/upgrade/upgrade'],
        ['/docs/archive/unknown', '/docs/zh-cn'],
    ]) {
        await page.goto(oldUrl);
        await expect.poll(() => new URL(page.url()).pathname).toBe(destination);
    }
    await expect(page.getByRole('navigation', {name: '文档目录'})).not.toContainText('历史版本文档');
});

test('旧书签保留已改名的章节', async ({page}) => {
    for (const [bookmark, heading] of [
        ['/docs/#/quick_start/quick_start?id=_2-添加与摆放组件', '3. 添加组件并配置数据'],
        ['/docs/#/?id=项目仓库', '按任务查阅'],
    ]) {
        await page.goto(bookmark);
        await expect.poll(() => page.evaluate(() =>
            document.getElementById(decodeURIComponent(location.hash.slice(1)))?.textContent)).toBe(heading);
        await page.reload();
        await expect(page.getByRole('heading', {name: heading, exact: true})).toBeVisible();
    }
});

test('从折叠目录打开工作台设置，能显示中文文件名截图', async ({page}) => {
    await page.setViewportSize({width: 1440, height: 900});
    await page.goto('/docs');
    const chapters = page.getByRole('navigation', {name: '文档目录'});
    await chapters.getByRole('button', {name: '展开功能介绍'}).click();
    await chapters.getByRole('button', {name: '展开工作台'}).click();
    await chapters.getByRole('link', {name: '设置', exact: true}).click();
    await expect(page).toHaveURL(/\/functions\/home\/setting$/);
    const screenshot = page.locator('article img').first();
    await screenshot.scrollIntoViewIfNeeded();
    await expect.poll(() => screenshot.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await expect(chapters.getByRole('link', {name: '设置', exact: true})).toHaveAttribute('aria-current', 'page');
});

test('插件专题通过目录和搜索展示生成的能力、路由和规则', async ({page}) => {
    const topic = '/docs/zh-cn/develop/plugins';
    await page.setViewportSize({width: 1440, height: 900});
    await page.route('**/static/logo/**', route => route.fulfill({status: 404}));
    await page.goto('/docs/zh-cn');
    const chapters = page.getByRole('navigation', {name: '文档目录'});
    const article = page.getByRole('main');

    await chapters.getByRole('link', {name: '插件开发', exact: true}).click();
    await expect(page).toHaveURL(topic);
    await expect(article.getByRole('row', {name: /workbench.*homeLayout.*workbench/})).toBeVisible();
    await article.getByRole('link', {name: 'router', exact: true}).click();
    await expect(page).toHaveURL(topic + '/router');
    await expect(article.getByText('@datavisool/plugin-api/contracts/router', {exact: true})).toBeVisible();
    await expect(article.locator('pre code').filter({hasText: 'interface RouterService'})).toContainText('registerRoutes');

    await chapters.getByRole('link', {name: '插件开发', exact: true}).click();
    await article.getByRole('link', {name: 'navigation', exact: true}).click();
    await expect(page).toHaveURL(topic + '/navigation');
    await expect(article.getByRole('row', {name: /提供.*navigation.*workbench/})).toBeVisible();
    await expect(article.locator('pre code').filter({hasText: 'interface NavigationService'})).toContainText('registerMenuEntries');

    await chapters.getByRole('link', {name: '插件开发', exact: true}).click();
    await article.getByRole('link', {name: 'home-layout', exact: true}).click();
    await expect(page).toHaveURL(topic + '/home-layout');
    await expect(article.getByRole('row', {name: /提供.*homeLayout.*workbench/})).toBeVisible();
    const layoutCode = article.locator('pre code').filter({hasText: 'interface HomeLayoutService'});
    await expect(layoutCode).toContainText('readonly Layout: ComponentType<HomeLayoutProps>');
    await expect(layoutCode).toContainText('readonly navigation: ReactNode');

    await page.getByRole('button', {name: '搜索文档'}).click();
    await page.getByRole('searchbox', {name: '搜索文档'}).fill('login:form');
    await page.getByRole('dialog').getByRole('link', {name: /公开路由.*login/}).click();
    await expect(article.getByRole('heading', {name: 'login', exact: true})).toBeVisible();
    await expect(article.getByRole('row', {name: /login:root\s+\/$/})).toBeVisible();
    await expect(article.getByRole('row', {name: /login:form\s+\/login/})).toBeVisible();
    await expect(article.getByRole('row', {name: /依赖.*session.*session/})).toBeVisible();

    await article.getByRole('link', {name: '查看统一的插件规范'}).click();
    await expect(page).toHaveURL(topic + '/design');
    await expect(article.getByRole('heading', {name: '禁止事项', exact: true})).toBeVisible();
    await expect(article.getByRole('heading', {name: '停用清理', exact: true})).toBeVisible();
    await page.setViewportSize({width: 390, height: 844});
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
