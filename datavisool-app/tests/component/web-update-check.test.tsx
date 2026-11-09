/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {cleanup, fireEvent, render, screen, waitFor} from "@testing-library/react";
import {afterEach, beforeEach, describe, expect, test, vi} from "vitest";

const mocks = vi.hoisted(() => ({
    role: "ROLE_SYSTEM_ADMIN",
    get: vi.fn(),
    post: vi.fn(),
    messages: {success: vi.fn(), error: vi.fn(), warning: vi.fn()},
}));

vi.mock("@/util/AuthTools.ts", () => ({
    default: {
        getUserInfo: () => ({id: "2", username: "tester", roles: [mocks.role]}),
        getUserId: () => "2",
        setUserInfo: vi.fn(),
    },
    RoleType: {SYSTEM_ADMIN: "ROLE_SYSTEM_ADMIN", ADMIN: "ROLE_ADMIN", USER: "ROLE_USER"},
}));
vi.mock("@/util/AuthFetchUtil.ts", () => ({default: {get: mocks.get, post: mocks.post}}));
vi.mock("@/i18n/miniI18n.ts", () => ({
    tx: (value: string) => value,
    getLocale: () => "zh-CN",
    setLocale: vi.fn(),
}));
vi.mock("@/i18n/useLocaleVersion.ts", () => ({useLocaleVersion: () => 0}));
vi.mock("@/util/TauriCompatUtil.ts", () => ({openExternalUrl: vi.fn(async () => undefined)}));
vi.mock("@/util/HybridCryptoUtil.ts", () => ({HybridCryptoUtil: {encryptRequest: vi.fn()}}));
vi.mock("@/comps/common-component/contact-author/ContactAuthorModal.tsx", () => ({default: () => null}));
vi.mock("@datavisool/ui", () => ({
    Avatar: ({children}: any) => <span>{children}</span>,
    Button: ({children, onClick, disabled, loading}: any) => (
        <button type="button" onClick={onClick} disabled={disabled} data-loading={loading || undefined}>{children}</button>
    ),
    Card: ({children}: any) => <div>{children}</div>,
    Dialog: ({open, children}: any) => open ? <div role="dialog">{children}</div> : null,
    Input: (props: any) => <input {...props}/>,
    Menu: ({items, onClick}: any) => <nav>{items.map((item: any) => (
        <button key={item.key} type="button" onClick={() => onClick({key: item.key})}>{item.label}</button>
    ))}</nav>,
    Select: () => <select aria-label="语言"/>,
    Tag: ({children}: any) => <span>{children}</span>,
    globalMessage: mocks.messages,
}));
vi.mock("@icon-park/react", () => {
    const Icon = () => null;
    return {
        Agreement: Icon, BookOpen: Icon, Check: Icon, Close: Icon, Edit: Icon, Headset: Icon,
        Help: Icon, Iphone: Icon, Mail: Icon, Message: Icon, Picture: Icon, Right: Icon,
        Setting: Icon, Shield: Icon, User: Icon,
    };
});

import Setting from "@/pages/home/setting/Setting.tsx";
import WebUpdateNotice from "@/pages/home/web-update/WebUpdateNotice.tsx";

const updatePath = "/api/webUpdate/check?";
const upgradeAvailable = {needUpgrade: true, latestVersion: "2026.10.0"};
const upToDate = {needUpgrade: false, latestVersion: "2026.9.0"};

function configureResponses(responses: unknown[]) {
    const queued = [...responses];
    mocks.get.mockImplementation((url: string) => {
        if (url === "/api/user/getUser/2") {
            return Promise.resolve({id: "2", username: "tester", name: "Tester"});
        }
        if (url.startsWith(updatePath)) {
            const next = queued.shift();
            return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
        }
        return Promise.resolve(null);
    });
}

function renderSettings() {
    return render(<WebUpdateNotice><Setting/></WebUpdateNotice>);
}

async function openAboutAndClickCheck() {
    fireEvent.click(screen.getByRole("button", {name: "关于"}));
    const checkButton = screen.getByRole("button", {name: "检查更新"});
    fireEvent.click(checkButton);
    return checkButton;
}

function updateRequests() {
    return mocks.get.mock.calls.filter(([url]) => typeof url === "string" && url.startsWith(updatePath));
}

describe("Web version check from Settings", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.role = "ROLE_SYSTEM_ADMIN";
        mocks.post.mockResolvedValue(true);
        configureResponses([upToDate]);
    });

    afterEach(() => cleanup());

    test("manual check reopens an update after skipping it and includes skipped versions", async () => {
        configureResponses([upgradeAvailable, upgradeAvailable]);
        renderSettings();

        await waitFor(() => expect(updateRequests()).toHaveLength(1));
        expect(updateRequests()[0][0]).toMatch(/currentVersion=[^&]+$/);
        expect(updateRequests()[0][0]).not.toContain("includeSkipped");
        expect(await screen.findByText("发现新版本")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", {name: "跳过该版本"}));
        await waitFor(() => expect(mocks.post).toHaveBeenCalledWith("/api/webUpdate/skip", {
            latestVersion: "2026.10.0",
        }));
        await waitFor(() => expect(screen.queryByText("发现新版本")).not.toBeInTheDocument());

        await openAboutAndClickCheck();
        expect(await screen.findByText("发现新版本")).toBeInTheDocument();
        await waitFor(() => expect(updateRequests()).toHaveLength(2));
        expect(updateRequests()[1][0]).toContain("includeSkipped=true");
    });

    test("manual check reports that the current version is latest only for a valid response", async () => {
        configureResponses([upToDate, upToDate]);
        renderSettings();

        await waitFor(() => expect(updateRequests()).toHaveLength(1));
        await openAboutAndClickCheck();

        await waitFor(() => expect(mocks.messages.success).toHaveBeenCalledWith("已是最新版本"));
        expect(mocks.messages.error).not.toHaveBeenCalled();
        expect(updateRequests()[1][0]).toContain("includeSkipped=true");
    });

    test("manual check explains when the update service is unavailable", async () => {
        configureResponses([{needUpgrade: false, available: false}, {needUpgrade: false, available: false}]);
        renderSettings();

        await waitFor(() => expect(updateRequests()).toHaveLength(1));
        expect(mocks.messages.warning).not.toHaveBeenCalled();
        await openAboutAndClickCheck();

        await waitFor(() => expect(mocks.messages.warning).toHaveBeenCalledWith("暂未提供更新服务"));
        expect(mocks.messages.success).not.toHaveBeenCalled();
        expect(mocks.messages.error).not.toHaveBeenCalled();
    });

    test.each([
        ["missing response", null],
        ["missing latest version", {needUpgrade: false}],
        ["request error", new Error("offline")],
    ])("manual check reports failure for %s instead of claiming the version is latest", async (_label, response) => {
        configureResponses([upToDate, response]);
        renderSettings();

        await waitFor(() => expect(updateRequests()).toHaveLength(1));
        await openAboutAndClickCheck();

        await waitFor(() => expect(mocks.messages.error).toHaveBeenCalledWith("检查更新失败"));
        expect(mocks.messages.success).not.toHaveBeenCalledWith("已是最新版本");
    });

    test("regular users cannot check and do not trigger the automatic request", async () => {
        mocks.role = "ROLE_USER";
        renderSettings();

        await waitFor(() => expect(mocks.get).toHaveBeenCalledWith("/api/user/getUser/2"));
        expect(updateRequests()).toHaveLength(0);

        fireEvent.click(screen.getByRole("button", {name: "关于"}));
        const checkButton = screen.getByRole("button", {name: "检查更新"});
        expect(checkButton).toBeDisabled();
        fireEvent.click(checkButton);
        expect(updateRequests()).toHaveLength(0);
    });

    test("overlapping manual clicks share one request, and unmount aborts an active check", async () => {
        let resolveManual!: (value: unknown) => void;
        configureResponses([upToDate]);
        mocks.get.mockImplementation((url: string) => {
            if (url === "/api/user/getUser/2") {
                return Promise.resolve({id: "2", username: "tester"});
            }
            if (url.startsWith(updatePath)) {
                if (updateRequests().length === 1) return Promise.resolve(upToDate);
                return new Promise((resolve) => { resolveManual = resolve; });
            }
            return Promise.resolve(null);
        });
        const view = renderSettings();

        await waitFor(() => expect(updateRequests()).toHaveLength(1));
        fireEvent.click(screen.getByRole("button", {name: "关于"}));
        const checkButton = screen.getByRole("button", {name: "检查更新"});
        fireEvent.click(checkButton);
        fireEvent.click(checkButton);
        await waitFor(() => expect(updateRequests()).toHaveLength(2));
        expect(updateRequests()).toHaveLength(2);

        const requestOptions = updateRequests()[1][1] as {signal: AbortSignal};
        expect(requestOptions.signal.aborted).toBe(false);
        view.unmount();
        expect(requestOptions.signal.aborted).toBe(true);
        resolveManual(upToDate);
    });
});
