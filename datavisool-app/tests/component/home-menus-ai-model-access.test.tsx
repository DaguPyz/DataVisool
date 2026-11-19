/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {cleanup, fireEvent, render, screen} from "@testing-library/react";
import {Suspense} from "react";
import {afterEach, beforeEach, describe, expect, test, vi} from "vitest";
import type {RouteLocation} from "@datavisool/sdk/plugin/contracts/router";
import {RoleType} from "@datavisool/sdk/plugin/contracts/session";
import {createAiModelManagementPlugin} from "@/plugins/ai-model-management/aiModelManagementPlugin.tsx";
import {createNavigationPlugin} from "@/plugins/navigation/navigationPlugin.tsx";
import {createSettingsPlugin} from "@/plugins/settings/settingsPlugin.tsx";
import {createUserManagementPlugin} from "@/plugins/user-management/userManagementPlugin.tsx";
import type {Plugin} from "@datavisool/sdk/plugin";
import {Visloom} from "@/visloom/index.ts";
import {createI18nPlugin} from "@/plugins/i18n/i18nPlugin.ts";
import {useMemoryLocalStorage} from './support/localStorageFixture.ts';

useMemoryLocalStorage();

const mocks = vi.hoisted(() => ({navigate: vi.fn(async () => {})}));
vi.mock("@datavisool/ui", () => ({
    globalMessage: {},
    Menu: ({items, onClick}: any) => (
        <nav>{items.map((item: any) => (
            <button key={item.key} onClick={() => onClick({key: item.key})}>{item.label}</button>
        ))}</nav>
    ),
}));

const runtimes: Visloom[] = [];

async function renderMenus(role: RoleType) {
    const userInfo = {id: "2", name: "Tester", username: "tester", token: "fixture-token", roles: [role]};
    let location: RouteLocation | undefined;
    const services: Plugin = {
        id: "fixture-services",
        requires: [],
        provides: ['router', 'session', 'workbench'],
        activate(context) {
            context.provide('router', {
                Link: () => null,
                registerRoutes: () => ({prepare() {}, dispose() {}}),
                createView: () => null,
                getLocation: () => location,
                pathFor: routeId => "/fixture/" + routeId,
                navigate: mocks.navigate,
            });
            context.provide('session', {
                getUserInfo: () => userInfo, setUserInfo() {}, removeUser() {}, logout: async () => true,
            });
            context.provide('workbench', {registerAccountEntries: () => ({prepare() {}, dispose() {}})});
            context.onStop({withdraw() { location = undefined; }});
        },
    };
    const runtime = new Visloom();
    await runtime.start([services, createI18nPlugin(), createNavigationPlugin(), createAiModelManagementPlugin(),
        createUserManagementPlugin(), createSettingsPlugin()]);
    runtimes.push(runtime);
    runtime.get('i18n').setLocale('zh-CN');
    location = {key: "fixture", pathname: "/home/console", hash: "", search: "", matchedRouteIds: ["app:console"]};
    const {Navigation} = runtime.get('navigation');
    render(<Suspense fallback={null}><Navigation/></Suspense>);
}

describe("AI model menu access", () => {
    beforeEach(() => vi.clearAllMocks());
    afterEach(async () => {
        cleanup();
        for (const runtime of runtimes.splice(0)) await runtime.stop();
    });

    test.each([RoleType.USER, RoleType.ADMIN])("%s can open model management", async (role) => {
        await renderMenus(role);
        const modelMenu = await screen.findByRole("button", {name: "AI模型管理"});
        expect(screen.queryByRole("button", {name: "用户管理"})).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "设置", exact: true})).not.toBeInTheDocument();
        fireEvent.click(modelMenu);
        expect(mocks.navigate).toHaveBeenCalledWith("/fixture/app:ai-models");
    });

    test("system administrators still have model, user and settings menus", async () => {
        await renderMenus(RoleType.SYSTEM_ADMIN);
        expect(await screen.findByRole("button", {name: "AI模型管理"})).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "用户管理"})).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "设置", exact: true})).toBeInTheDocument();
    });
});
