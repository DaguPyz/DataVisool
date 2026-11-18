/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {fireEvent, render, screen} from "@testing-library/react";
import {beforeEach, describe, expect, test, vi} from "vitest";
import ProjectItem from "@/plugins/project-list/ProjectItem.tsx";

vi.mock("@datavisool/ui", () => ({
    Dropdown: ({children, menu}: any) => (
        <div>
            {children}
            <button type="button" onClick={menu.items.find((item: any) => item.key === "3").onClick}>重命名</button>
        </div>
    ),
    globalMessage: {},
}));

describe("ProjectItem double click", () => {
    const doOperate = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
    });

    test("enters edit on card double click and ignores interactive elements", () => {
        const {container} = render(
            <ProjectItem id="project-1" name="测试项目" doOperate={doOperate}
                         canOperate={() => true} navigate={async () => {}}
                         renameProject={async () => true} translate={text => text}/>,
        );
        const card = container.querySelector(".project-list-item")!;

        fireEvent.doubleClick(card);
        expect(doOperate).toHaveBeenCalledWith("project-1", "edit");

        fireEvent.doubleClick(container.querySelector(".project-cover-menu")!);
        expect(doOperate).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByRole("button", {name: "重命名"}));
        fireEvent.doubleClick(card);
        expect(doOperate).toHaveBeenCalledTimes(1);
    });
});
