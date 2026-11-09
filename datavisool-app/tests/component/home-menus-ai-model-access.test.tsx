/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {act, fireEvent, render, screen} from "@testing-library/react";
import {afterEach, beforeEach, describe, expect, test, vi} from "vitest";
import {HomeMenus} from "@/pages/home/menus/HomeMenus.tsx";

const mocks = vi.hoisted(() => ({role: "ROLE_USER", navigate: vi.fn()}));

vi.mock("react-router-dom", () => ({
    useNavigate: () => mocks.navigate,
    useLocation: () => ({pathname: "/home/console"}),
}));
vi.mock("@/util/AuthTools.ts", () => ({
    default: {getUserInfo: () => ({id: "2", username: "tester", roles: [mocks.role]})},
    RoleType: {SYSTEM_ADMIN: "ROLE_SYSTEM_ADMIN", ADMIN: "ROLE_ADMIN", USER: "ROLE_USER"},
}));
vi.mock("@/util/AuthFetchUtil.ts", () => ({default: {post: vi.fn()}}));
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

describe("AI model menu access", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
    });

    afterEach(() => vi.useRealTimers());

    test.each(["ROLE_USER", "ROLE_ADMIN"])("%s can open model management", (role) => {
        mocks.role = role;
        render(<HomeMenus/>);
        expect(screen.queryByRole("button", {name: "用户管理"})).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "设置", exact: true})).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", {name: "AI模型管理"}));
        act(() => vi.advanceTimersByTime(260));
        expect(mocks.navigate).toHaveBeenCalledWith("aiModel");
    });

    test("system administrators still have model, user and settings menus", () => {
        mocks.role = "ROLE_SYSTEM_ADMIN";
        render(<HomeMenus/>);
        expect(screen.getByRole("button", {name: "AI模型管理"})).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "用户管理"})).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "设置", exact: true})).toBeInTheDocument();
    });
});
