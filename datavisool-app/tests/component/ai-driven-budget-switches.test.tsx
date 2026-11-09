/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {fireEvent, render, screen, within, waitFor} from "@testing-library/react";
import {afterEach, beforeEach, expect, test, vi} from "vitest";
const fetch = vi.hoisted(() => ({getOrThrow: vi.fn(), post: vi.fn()}));
vi.mock("@/util/AuthFetchUtil.ts", () => ({default: fetch}));
vi.mock("@/i18n/miniI18n.ts", () => ({tx: (s: string) => s}));
vi.mock("@/i18n/useLocaleVersion.ts", () => ({useLocaleVersion: () => 0}));
vi.mock("@datavisool/ui", () => ({
    Button: ({children, onClick, disabled}: any) => <button onClick={onClick} disabled={disabled}>{children}</button>,
    NumberInput: ({value, onChange}: any) => <input value={value} onChange={e => onChange(Number(e.target.value))}/>,
    Switch: ({value, onChange}: any) => <button role="switch" aria-checked={value} onClick={() => onChange(!value)}/>,
    Spin: ({children}: any) => <>{children}</>,
    globalMessage: {success: vi.fn()},
}));
import Panel from "@/designer/ai-driven/AiDrivenSettingsPanel.tsx";

beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("localStorage", {getItem: () => null, setItem: vi.fn()});
    fetch.getOrThrow.mockResolvedValue({settings: {schemaVersion: 2}, defaults: {schemaVersion: 2}});
    fetch.post.mockImplementation((_url, body) => Promise.resolve(body));
});
afterEach(() => vi.unstubAllGlobals());

test("all budget switches start off and saving one switch preserves the other two", async () => {
    const close = vi.fn();
    render(<Panel visible running={false} onClose={close}/>);
    const token = within(await screen.findByRole("group", {name: "启用 Token 预算"})).getByRole("switch");
    const calls = within(screen.getByRole("group", {name: "启用调用次数预算"})).getByRole("switch");
    const duration = within(screen.getByRole("group", {name: "启用时长预算"})).getByRole("switch");
    expect(token).toHaveAttribute("aria-checked", "false");
    expect(calls).toHaveAttribute("aria-checked", "false");
    expect(duration).toHaveAttribute("aria-checked", "false");
    fireEvent.click(calls);
    fireEvent.click(screen.getByRole("button", {name: "保存设置"}));
    await waitFor(() => expect(fetch.post).toHaveBeenCalled());
    expect(fetch.post.mock.calls[0][1]).toMatchObject({schemaVersion: 2,
        execution: {tokenBudgetEnabled: false, callBudgetEnabled: true, durationBudgetEnabled: false}});
    expect(close).toHaveBeenCalled();
});

test("failed saves keep the panel open and display the persistence failure", async () => {
    const close = vi.fn();
    fetch.post.mockResolvedValue(null);
    render(<Panel visible running={false} onClose={close}/>);
    await screen.findByRole("group", {name: "启用 Token 预算"});
    fireEvent.click(screen.getByRole("button", {name: "保存设置"}));
    await screen.findByText("保存失败，请检查配置后重试");
    expect(close).not.toHaveBeenCalled();
});

test("unsupported stored settings show the version error and cannot be saved", async () => {
    fetch.getOrThrow.mockRejectedValue(new Error("已保存的 AI 运行设置无法读取：不支持的 AI 运行设置版本，仅支持版本 2"));
    render(<Panel visible running={false} onClose={vi.fn()}/>);
    await screen.findByText("AI 运行设置版本不受支持，仅支持版本 2。");
    expect(screen.queryByRole("button", {name: "保存设置"})).not.toBeInTheDocument();
    expect(fetch.post).not.toHaveBeenCalled();
});

test("a failed reload clears the previous draft before allowing a retry", async () => {
    const close = vi.fn();
    const view = render(<Panel visible running={false} onClose={close}/>);
    await screen.findByRole("group", {name: "启用 Token 预算"});
    view.rerender(<Panel visible={false} running={false} onClose={close}/>);
    fetch.getOrThrow.mockResolvedValue(null);
    view.rerender(<Panel visible running={false} onClose={close}/>);
    await screen.findByText("读取 AI 运行设置失败，请重试");
    expect(screen.queryByRole("button", {name: "保存设置"})).not.toBeInTheDocument();
    fetch.getOrThrow.mockResolvedValue({settings: {schemaVersion: 2}, defaults: {schemaVersion: 2}});
    fireEvent.click(screen.getByRole("button", {name: "重试"}));
    await screen.findByRole("group", {name: "启用 Token 预算"});
});
