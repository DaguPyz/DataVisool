/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import {beforeEach, describe, expect, test, vi} from "vitest";
import ConsoleDashboard from "@/pages/home/console/ConsoleDashboard.tsx";

const mocks = vi.hoisted(() => ({
    post: vi.fn(),
    navigate: vi.fn(),
    createProject: vi.fn(),
    error: vi.fn(),
    role: "ROLE_SYSTEM_ADMIN",
}));

vi.mock("@/util/AuthFetchUtil.ts", () => ({default: {post: mocks.post}}));
vi.mock("@/api/engineering/BaseApi.ts", () => ({default: {createProject: mocks.createProject}}));
vi.mock("@/util/AuthTools.ts", () => ({
    default: {getUserInfo: () => ({roles: [mocks.role]})},
    RoleType: {SYSTEM_ADMIN: "ROLE_SYSTEM_ADMIN"},
}));
vi.mock("react-router-dom", () => ({useNavigate: () => mocks.navigate}));
vi.mock("@/i18n/miniI18n.ts", () => ({tx: (value: string) => value}));
vi.mock("@/i18n/useLocaleVersion.ts", () => ({useLocaleVersion: () => 0}));
vi.mock("countup.js", () => ({
    CountUp: class {
        constructor(private element: HTMLElement, private value: number) {}
        reset() {}
        start() { this.element.textContent = String(this.value); }
    },
}));
vi.mock("@datavisool/ui", () => ({
    Button: ({children, icon, onClick, className}: any) => (
        <button type="button" className={className} onClick={onClick}>{icon}{children}</button>
    ),
    globalMessage: {messageApi: {error: mocks.error}},
}));
vi.mock("@/pages/home/project-list/NewProjectDialog.tsx", () => ({
    default: ({visible, onOk, onCancel}: any) => visible ? (
        <div role="dialog">
            <button type="button" onClick={() => onOk({name: "新项目", des: "项目说明", width: 1280, height: 720})}>创建项目</button>
            <button type="button" onClick={onCancel}>取消</button>
        </div>
    ) : null,
}));

function toArrayDate(date: Date) {
    return [date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds()];
}

function createPages() {
    const now = new Date();
    const recent = (daysAgo: number) => toArrayDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo));
    return {
        "/api/project/pageList": {total: 12, records: [{id: "p1", name: "项目一", updateTime: recent(6)}]},
        "/api/font/pageList": {total: 2, records: []},
        "/api/video/page": {total: 3, records: []},
        "/api/model/page": {total: 4, records: []},
        "/api/dynamicScript/pageList": {total: 5, records: [{id: "s1", name: "脚本一", createTime: recent(5)}]},
        "/api/aiModel/pageList": {total: 6, records: [{id: "ai1", name: "模型一", createTime: recent(4)}]},
        "/api/remote/component/pageList": {total: 7, records: [{id: "rc1", componentName: "组件一", createTime: recent(3)}]},
        "/api/commonDatabase/pageList": {total: 8, records: [{id: "db1", name: "数据库一", updateTime: "invalid", createTime: recent(2)}]},
        "/api/commonApi/pageList": {total: 9, records: [{id: "api1", name: "接口一", createTime: recent(1)}]},
        "/api/release/pageList": {total: 10, records: [{id: "r1", name: "发布一", createTime: recent(0), state: true}]},
    };
}

describe("ConsoleDashboard", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.role = "ROLE_SYSTEM_ADMIN";
        const pages = createPages();
        mocks.post.mockImplementation(async (url: keyof typeof pages) => pages[url]);
        mocks.createProject.mockResolvedValue("new-project-id");
    });

    test("aggregates service resources and shows the five latest updates from Web array dates", async () => {
        const {container} = render(<ConsoleDashboard/>);
        await waitFor(() => expect(container.firstElementChild).toHaveAttribute("aria-busy", "false"));

        expect(mocks.post).toHaveBeenCalledTimes(10);
        expect(screen.getByLabelText("资源总量 44 项")).toBeInTheDocument();
        const updates = container.querySelectorAll("button[data-type]");
        expect(Array.from(updates, (item) => item.getAttribute("data-type"))).toEqual([
            "release", "api", "database", "remote-component", "ai-model",
        ]);
        expect(screen.getByText("数据库一")).toBeInTheDocument();
        expect(screen.getByText("组件一")).toBeInTheDocument();
        for (const chart of screen.getAllByRole("img")) {
            expect(chart.querySelectorAll("rect")).toHaveLength(14);
        }
        const updateKpi = screen.getByText("近 2 周更新").closest("article")!;
        expect(within(updateKpi).getByText("7")).toBeInTheDocument();
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    test("resource, recent update and release actions navigate to their management pages", async () => {
        const {container} = render(<ConsoleDashboard/>);
        await waitFor(() => expect(container.firstElementChild).toHaveAttribute("aria-busy", "false"));

        fireEvent.click(screen.getByRole("button", {name: "查看 数据库"}));
        expect(mocks.navigate).toHaveBeenLastCalledWith("/home/database");
        fireEvent.click(screen.getByRole("button", {name: /接口一/}));
        expect(mocks.navigate).toHaveBeenLastCalledWith("/home/api");
        fireEvent.click(screen.getAllByRole("button", {name: "查看全部"})[0]);
        expect(mocks.navigate).toHaveBeenLastCalledWith("/home/server");
        fireEvent.click(screen.getAllByRole("button", {name: "查看全部"})[1]);
        expect(mocks.navigate).toHaveBeenLastCalledWith("/home/releaseManagement");
        fireEvent.click(screen.getByRole("button", {name: "查看", exact: true}));
        expect(mocks.navigate).toHaveBeenLastCalledWith("/home/releaseManagement");
    });

    test("regular users load their AI models and can open model management", async () => {
        mocks.role = "ROLE_USER";
        const {container} = render(<ConsoleDashboard/>);
        await waitFor(() => expect(container.firstElementChild).toHaveAttribute("aria-busy", "false"));

        expect(mocks.post).toHaveBeenCalledTimes(10);
        expect(mocks.post).toHaveBeenCalledWith("/api/aiModel/pageList", {current: 1, size: 50});
        fireEvent.click(screen.getByRole("button", {name: "查看 AI模型"}));
        expect(mocks.navigate).toHaveBeenLastCalledWith("/home/aiModel");
        expect(screen.getByLabelText("资源总量 44 项")).toBeInTheDocument();
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    test("keeps successful data when one resource request fails and can retry", async () => {
        const pages = createPages();
        mocks.post.mockImplementation(async (url: keyof typeof pages) => (
            url === "/api/commonDatabase/pageList" ? null : pages[url]
        ));
        render(<ConsoleDashboard/>);
        expect(await screen.findByRole("alert")).toHaveTextContent("部分数据加载失败");
        expect(screen.getByLabelText("资源总量 36 项")).toBeInTheDocument();

        mocks.post.mockImplementation(async (url: keyof typeof pages) => pages[url]);
        fireEvent.click(screen.getByRole("button", {name: "重新加载"}));
        await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
        expect(screen.getByLabelText("资源总量 44 项")).toBeInTheDocument();
    });

    test("creates a project with the selected canvas dimensions and opens its designer", async () => {
        const {container} = render(<ConsoleDashboard/>);
        await waitFor(() => expect(container.firstElementChild).toHaveAttribute("aria-busy", "false"));
        fireEvent.click(screen.getByRole("button", {name: "新建项目"}));
        fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", {name: "创建项目"}));

        await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith("/designer?id=new-project-id"));
        expect(mocks.createProject).toHaveBeenCalledWith({
            name: "新项目",
            des: "项目说明",
            dataJson: JSON.stringify({canvasManager: {width: 1280, height: 720}}),
        });
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
});
