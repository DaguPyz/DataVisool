/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {afterEach, describe, expect, test} from "vitest";
import {InteractionEngine, type LayerBox} from "@datavisool/interaction-engine";

const domRect = (left: number, top: number, width: number, height: number) => ({
    x: left,
    y: top,
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    toJSON: () => undefined,
}) as DOMRect;

afterEach(() => {
    document.body.innerHTML = "";
});

describe("interaction geometry refresh", () => {
    test("reads the latest model geometry and updates DOM, overlay, and hit testing", () => {
        const container = document.createElement("div");
        container.getBoundingClientRect = () => domRect(0, 0, 800, 600);
        const element = document.createElement("div");
        element.id = "component-a";
        container.append(element);
        document.body.append(container);

        let layer: LayerBox = {
            id: "component-a",
            x: 10,
            y: 20,
            width: 100,
            height: 80,
            rotate: 0,
        };
        const engine = new InteractionEngine({
            container,
            getScale: () => 1,
            getLayers: () => [layer],
            getLayerById: (id) => id === layer.id ? layer : null,
            getSelectedIds: () => [layer.id],
            getElementById: (id) => document.getElementById(id),
        });

        engine.mount();
        layer = {
            ...layer,
            x: 200,
            y: 150,
            width: 120,
            height: 90,
            rotate: 30,
        };

        expect(engine.refreshLayerGeometry([layer.id])).toBeGreaterThan(0);
        expect(element.style.transform).toBe("translate(200px, 150px) rotate(30deg)");
        expect(element.style.width).toBe("120px");
        expect(element.style.height).toBe("90px");

        const overlay = container.querySelector<HTMLElement>(".datavisool-interaction-resize-box");
        expect(overlay?.style.transform).toBe("translate(200px, 150px) rotate(30deg)");
        expect(engine.queryLayersAtClientPoint({clientX: 260, clientY: 195}).map((item) => item.id))
            .toContain(layer.id);
        expect(engine.queryLayersAtClientPoint({clientX: 20, clientY: 30}).map((item) => item.id))
            .not.toContain(layer.id);

        engine.destroy();
    });
});
