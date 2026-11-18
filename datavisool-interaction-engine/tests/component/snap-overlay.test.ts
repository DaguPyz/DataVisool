/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import {describe, expect, it} from 'vitest';
import {SnapOverlay, type SnapGuide} from '../../src/main';

function createGuide(axis: 'x' | 'y'): SnapGuide {
    const line = {
        id: 'layer:x:start',
        layerId: 'layer',
        axis,
        type: 'start' as const,
        value: axis === 'x' ? 100 : 80,
        spanStart: 50,
        spanEnd: 100,
    };

    return {
        axis,
        value: axis === 'x' ? 100 : 80,
        segmentStart: 50,
        segmentEnd: 100,
        segmentDistance: 50,
        relationDirection: axis === 'x' ? 'below' : 'right',
        moving: line,
        target: line,
    };
}

describe('SnapOverlay', () => {
    it('uses the default blue guide color when none is configured', () => {
        const container = document.createElement('div');
        const overlay = new SnapOverlay();

        overlay.attach(container);
        overlay.render([createGuide('y')]);

        const element = container.firstElementChild as HTMLElement;
        const label = element.firstElementChild as HTMLElement;
        expect(element.style.borderColor).toBe('rgb(80, 135, 246)');
        expect(label.style.color).toBe('rgb(80, 135, 246)');
    });

    it('renders vertical guides as short relation segments', () => {
        const container = document.createElement('div');
        const overlay = new SnapOverlay({guideColor: '#00ffcc'});

        overlay.attach(container);
        overlay.render([createGuide('x')]);

        const element = container.firstElementChild as HTMLElement;
        expect(element.style.transform).toBe('translate(100px, 50px)');
        expect(element.style.width).toBe('0px');
        expect(element.style.height).toBe('50px');
        expect(element.style.borderColor).toBe('rgb(0, 255, 204)');
        expect(element.firstElementChild?.textContent).toBe('50');
        expect((element.firstElementChild as HTMLElement).style.top).toBe('50%');
        expect((element.firstElementChild as HTMLElement).style.left).toBe('0px');
        expect((element.firstElementChild as HTMLElement).style.transform).toBe('translate(6px, -50%)');
    });

    it('renders horizontal guides as short relation segments', () => {
        const container = document.createElement('div');
        const overlay = new SnapOverlay();

        overlay.attach(container);
        overlay.render([createGuide('y')]);

        const element = container.firstElementChild as HTMLElement;
        expect(element.style.transform).toBe('translate(50px, 80px)');
        expect(element.style.width).toBe('50px');
        expect(element.style.height).toBe('0px');
        expect(element.firstElementChild?.textContent).toBe('50');
        expect((element.firstElementChild as HTMLElement).style.left).toBe('50%');
        expect((element.firstElementChild as HTMLElement).style.top).toBe('0px');
        expect((element.firstElementChild as HTMLElement).style.transform).toBe('translate(-50%, calc(-100% - 6px))');
    });

    it('renders full-span reference guides without measuring the container', () => {
        const container = document.createElement('div');
        const overlay = new SnapOverlay();

        overlay.attach(container);
        overlay.render([{
            ...createGuide('x'),
            fullSpan: true,
            segmentDistance: 0,
        }, {
            ...createGuide('y'),
            fullSpan: true,
            segmentDistance: 0,
        }]);

        const [vertical, horizontal] = Array.from(container.children) as HTMLElement[];
        expect(vertical.style.transform).toBe('translate(100px, 0px)');
        expect(vertical.style.height).toBe('100%');
        expect(horizontal.style.transform).toBe('translate(0px, 80px)');
        expect(horizontal.style.width).toBe('100%');
    });

    it('updates guide color at runtime', () => {
        const container = document.createElement('div');
        const overlay = new SnapOverlay();

        overlay.attach(container);
        overlay.setGuideColor('#ff00aa');
        overlay.render([createGuide('y')]);

        const element = container.firstElementChild as HTMLElement;
        const label = element.firstElementChild as HTMLElement;
        expect(element.style.borderColor).toBe('rgb(255, 0, 170)');
        expect(label.style.color).toBe('rgb(255, 0, 170)');
    });

    it('hides the distance label when relation ranges overlap', () => {
        const container = document.createElement('div');
        const overlay = new SnapOverlay();
        const guide = {
            ...createGuide('y'),
            segmentDistance: 0,
        };

        overlay.attach(container);
        overlay.render([guide]);

        const label = container.querySelector('.datavisool-interaction-snap-guide__label') as HTMLElement;
        expect(label.textContent).toBe('');
        expect(label.style.display).toBe('none');
    });
});
