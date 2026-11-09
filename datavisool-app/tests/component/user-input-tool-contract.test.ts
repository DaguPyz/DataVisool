/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {beforeEach, describe, expect, test, vi} from "vitest";

const mocks = vi.hoisted(() => ({requestInlineInteraction: vi.fn()}));
vi.mock("@/designer/ai-driven/AiDrivenProgressTerminalStore.ts", () => ({default: mocks}));
vi.mock("@datavisool/ui", () => ({globalModal: {modalApi: null}, TextArea: () => null}));

import {runUserInputTool} from "@/frontend-effect/tools/UserInputTool.ts";

const question = {
    id: "style", header: "风格", question: "选择风格", options: [
        {label: "蓝色", description: "科技风"}, {label: "灰色", description: "简洁风"},
    ],
};

describe("用户输入工具契约", () => {
    beforeEach(() => vi.resetAllMocks());

    test("声明的结构可进入交互并按问题ID返回答案", async () => {
        const data = {answers: {style: {answers: ["蓝色"]}}};
        mocks.requestInlineInteraction.mockResolvedValue({action: "submit", data});
        await expect(runUserInputTool("补充需求", {questions: [question]})).resolves.toEqual(data);
        expect(mocks.requestInlineInteraction).toHaveBeenCalledWith({
            kind: "userInput", title: "补充需求", questions: [question],
        }, undefined);
    });

    test.each([
        {prompt: "选择风格"},
        {questions: [{...question, options: [{label: "蓝色"}, {label: "灰色"}]}]},
        {questions: [question, question]},
        {questions: [{...question, options: [question.options[0], question.options[0]]}]},
    ])("错误结构不会进入用户等待", (payload) => {
        expect(() => runUserInputTool("补充需求", payload)).toThrow();
        expect(mocks.requestInlineInteraction).not.toHaveBeenCalled();
    });
});
