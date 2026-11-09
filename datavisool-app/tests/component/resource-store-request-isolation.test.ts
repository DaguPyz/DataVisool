/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {afterEach, beforeEach, describe, expect, test, vi} from "vitest";
import aiModelStore from "@/pages/home/ai-model-management/AiModelManagementStore.ts";

const mocks = vi.hoisted(() => ({
    userId: "user-a" as string | null,
    post: vi.fn(),
    get: vi.fn(),
    success: vi.fn(),
}));

vi.mock("@/util/AuthFetchUtil.ts", () => ({default: {post: mocks.post, get: mocks.get}}));
vi.mock("@/util/AuthTools.ts", () => ({default: {getUserId: () => mocks.userId}}));
vi.mock("@datavisool/ui", () => ({globalMessage: {messageApi: {success: mocks.success}}}));
vi.mock("@/i18n/miniI18n.ts", () => ({tx: (value: string) => value}));

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((done) => { resolve = done; });
    return {promise, resolve};
}

function page(id: string) {
    return {records: [{id, name: `private-${id}`, baseUrl: `https://${id}.example`}], total: 1, size: 6, current: 2};
}

async function flushResponses() {
    // Vitest wraps mock promises, so await the response callbacks as well as the original promise.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe("resource request isolation", () => {
    beforeEach(() => {
        aiModelStore.destroy();
        vi.resetAllMocks();
        mocks.userId = "user-a";
        mocks.post.mockResolvedValue(null);
        mocks.get.mockResolvedValue(null);
    });

    afterEach(() => aiModelStore.destroy());

    test("a late response from account A cannot populate account B's list even when B's request fails", async () => {
        const accountA = deferred<ReturnType<typeof page> | null>();
        const accountB = deferred<ReturnType<typeof page> | null>();
        mocks.post.mockReturnValueOnce(accountA.promise).mockReturnValueOnce(accountB.promise);
        aiModelStore.init();
        aiModelStore.destroy();
        mocks.userId = "user-b";
        aiModelStore.init();

        accountA.resolve(page("account-a-model"));
        await flushResponses();
        expect(aiModelStore.pageData.records).toEqual([]);
        accountB.resolve(null);
        await flushResponses();
        expect(aiModelStore.pageData.records).toEqual([]);
    });

    test.each(["user-b", null])("an account change to %s invalidates pending results before unmount", async (userId) => {
        const request = deferred<ReturnType<typeof page>>();
        mocks.post.mockReturnValueOnce(request.promise);
        aiModelStore.getList();
        mocks.userId = userId;
        request.resolve(page("account-a-model"));
        await flushResponses();
        expect(aiModelStore.pageData.records).toEqual([]);
    });

    test("closing the page blocks its pending response and clears its dialog", async () => {
        const request = deferred<ReturnType<typeof page>>();
        mocks.post.mockReturnValueOnce(request.promise);
        aiModelStore.init();
        aiModelStore.setCurrentItem({id: "old-item"});
        aiModelStore.setModalVisible(true);
        aiModelStore.destroy();
        request.resolve(page("old-page-model"));
        await flushResponses();
        expect(aiModelStore.pageData.records).toEqual([]);
        expect(aiModelStore.currentItem).toEqual({});
        expect(aiModelStore.modalVisible).toBe(false);
    });

    test("only the latest list response can update search or pagination results", async () => {
        const earlier = deferred<ReturnType<typeof page>>();
        const latest = deferred<ReturnType<typeof page>>();
        mocks.post.mockReturnValueOnce(earlier.promise).mockReturnValueOnce(latest.promise);
        aiModelStore.getList({searchValue: "earlier"});
        aiModelStore.getList({searchValue: "latest"});
        latest.resolve(page("latest"));
        await flushResponses();
        earlier.resolve(page("earlier"));
        await flushResponses();
        expect(aiModelStore.pageData.records).toMatchObject([{id: "latest", key: "latest"}]);
        expect(aiModelStore.pageData).toMatchObject({current: 2, size: 6, total: 1});
    });

    test("an old edit response cannot replace the next account's current dialog", async () => {
        const request = deferred<{id: string; name: string}>();
        mocks.get.mockReturnValueOnce(request.promise);
        aiModelStore.fetchAndEdit("/api/resource/old-item");
        aiModelStore.destroy();
        mocks.userId = "user-b";
        aiModelStore.setCurrentItem({id: "new-item"});
        aiModelStore.setModalVisible(true);
        request.resolve({id: "old-item", name: "private old item"});
        await flushResponses();
        expect(aiModelStore.currentItem).toEqual({id: "new-item"});
        expect(aiModelStore.modalVisible).toBe(true);
    });

    test.each(["save", "delete", "copy"])("late %s callbacks cannot refresh or close another account's UI", async (operation) => {
        const request = deferred<boolean>();
        mocks.post.mockReturnValueOnce(request.promise);
        mocks.get.mockReturnValueOnce(request.promise);
        aiModelStore.setCurrentItem({name: "old-item"});
        if (operation === "save") aiModelStore.saveItem();
        if (operation === "delete") aiModelStore.doBatchDelete(["old-item"]);
        if (operation === "copy") aiModelStore.copyItem("/api/resource/copy/old-item");

        aiModelStore.destroy();
        mocks.userId = "user-b";
        aiModelStore.setCurrentItem({id: "new-item"});
        aiModelStore.setModalVisible(true);
        request.resolve(true);
        await flushResponses();
        expect(mocks.post).toHaveBeenCalledTimes(operation === "copy" ? 0 : 1);
        expect(mocks.get).toHaveBeenCalledTimes(operation === "copy" ? 1 : 0);
        expect(mocks.success).not.toHaveBeenCalled();
        expect(aiModelStore.currentItem).toEqual({id: "new-item"});
        expect(aiModelStore.modalVisible).toBe(true);
    });

    test("reopening the page for the same account invalidates earlier edit callbacks", async () => {
        const request = deferred<{id: string}>();
        mocks.get.mockReturnValueOnce(request.promise);
        aiModelStore.init();
        aiModelStore.fetchAndEdit("/api/resource/old-item");
        aiModelStore.destroy();
        aiModelStore.init();
        request.resolve({id: "old-item"});
        await flushResponses();
        expect(aiModelStore.currentItem).toEqual({});
        expect(aiModelStore.modalVisible).toBe(false);
    });

    test("a current save still closes its dialog and refreshes the current user's data", async () => {
        const save = deferred<boolean>();
        const list = deferred<ReturnType<typeof page>>();
        mocks.post.mockReturnValueOnce(save.promise).mockReturnValueOnce(list.promise);
        aiModelStore.setCurrentItem({name: "current-item"});
        aiModelStore.setModalVisible(true);
        aiModelStore.saveItem();
        save.resolve(true);
        await flushResponses();
        expect(aiModelStore.modalVisible).toBe(false);
        expect(aiModelStore.currentItem).toEqual({});
        expect(mocks.post).toHaveBeenCalledTimes(2);
        expect(mocks.success).toHaveBeenCalledWith("操作成功");
        list.resolve(page("current-model"));
        await flushResponses();
        expect(aiModelStore.pageData.records).toMatchObject([{id: "current-model"}]);
    });
});
