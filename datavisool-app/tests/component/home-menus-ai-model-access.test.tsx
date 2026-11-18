/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {fireEvent, render, screen} from "@testing-library/react";
import {beforeEach, describe, expect, test, vi} from "vitest";
import {RoleType} from "@/contracts/session.ts";
import {createLegacyWorkbenchPages} from "@/plugins/legacy-routes/workbenchPages.tsx";
import {HomeMenus} from "@/plugins/workbench/HomeMenus.tsx";

const mocks = vi.hoisted(() => ({selectPage: vi.fn()}));
vi.mock("@/i18n/miniI18n.ts", () => ({tx: (value: string) => value}));
vi.mock("@/i18n/useLocaleVersion.ts", () => ({useLocaleVersion: () => 0}));
vi.mock("@datavisool/ui", () => ({
    Menu: ({items, onClick}: any) => (
        <nav>{items.map((item: any) => (
            <button key={item.key} onClick={() => onClick({key: item.key})}>{item.label}</button>
        ))}</nav>
    ),
    Avatar: ({children}: any) => <span>{children}</span>,
    Dropdown: ({children}: any) => children,
}));

function renderMenus(role: RoleType) {
    const userInfo = {id: "2", name: "Tester", username: "tester", token: "fixture-token", roles: [role]};
    const entries = createLegacyWorkbenchPages(() => {}).map(({route, menu, accountMenuLabel}) =>
        ({routeId: route.id, menu, accountMenuLabel}));
    return render(<HomeMenus entries={entries} userInfo={userInfo} logoRevisions={{}} matchedRouteIds={['app:console']}
                             onSelectPage={mocks.selectPage} onSelectAccountPage={() => {}} onLogout={async () => {}}/>);
}

describe("AI model menu access", () => {
    beforeEach(() => vi.clearAllMocks());

    test.each([RoleType.USER, RoleType.ADMIN])("%s can open model management", (role) => {
        renderMenus(role);
        expect(screen.queryByRole("button", {name: "用户管理"})).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "设置", exact: true})).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", {name: "AI模型管理"}));
        expect(mocks.selectPage).toHaveBeenCalledWith("app:ai-models");
    });

    test("system administrators still have model, user and settings menus", () => {
        renderMenus(RoleType.SYSTEM_ADMIN);
        expect(screen.getByRole("button", {name: "AI模型管理"})).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "用户管理"})).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "设置", exact: true})).toBeInTheDocument();
    });
});
