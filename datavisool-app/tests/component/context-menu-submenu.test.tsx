/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {fireEvent, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, test, vi} from 'vitest';
import ContextMenu from '@/framework/context-menu/ContextMenu.tsx';

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
    vi.restoreAllMocks();
    Object.defineProperty(window, 'innerWidth', {configurable: true, value: 1024});
    Object.defineProperty(window, 'innerHeight', {configurable: true, value: 768});
});

describe('ContextMenu submenus', () => {
    test('renders nested items and only invokes leaf actions', () => {
        const parentAction = vi.fn();
        const leafAction = vi.fn();
        const documentClick = vi.fn();
        document.addEventListener('click', documentClick);

        render(
            <ContextMenu
                visible
                position={[20, 20]}
                menus={[{
                    name: '选择图层',
                    onClick: parentAction,
                    children: [{
                        name: '分组图层',
                        onClick: parentAction,
                        children: [{name: '图层 A', onClick: leafAction}],
                    }],
                }]}
            />,
        );

        fireEvent.mouseEnter(screen.getByText('选择图层').closest('.context-menu-item')!);
        fireEvent.click(screen.getByText('选择图层'));
        expect(parentAction).not.toHaveBeenCalled();
        expect(documentClick).not.toHaveBeenCalled();
        expect(screen.getByText('分组图层')).toBeVisible();

        fireEvent.click(screen.getByText('分组图层'));
        expect(parentAction).not.toHaveBeenCalled();
        expect(documentClick).not.toHaveBeenCalled();
        expect(screen.getByText('图层 A')).toBeVisible();

        fireEvent.click(screen.getByText('图层 A'));
        expect(leafAction).toHaveBeenCalledTimes(1);
        expect(documentClick).toHaveBeenCalledTimes(1);
        document.removeEventListener('click', documentClick);
    });

    test('uses measured bounds for root and submenu viewport placement', () => {
        Object.defineProperty(window, 'innerWidth', {
            configurable: true,
            value: 700,
        });
        Object.defineProperty(window, 'innerHeight', {configurable: true, value: 300});
        let anchorTop = 238;
        vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
            if (this.classList.contains('context-menu-submenu'))
                return domRect(0, 0, 220, 80);
            if (this.classList.contains('context-menu-item'))
                return domRect(512, anchorTop, 180, 36);
            return domRect(0, 0, 180, 54);
        });

        render(
            <ContextMenu
                visible
                width={180}
                position={[650, 295]}
                menus={[{
                    name: '选择图层',
                    children: [{name: '图层 A'}],
                }]}
            />,
        );

        const root = document.querySelector<HTMLElement>('.context-menu-container')!;
        fireEvent.click(screen.getByText('选择图层'));
        const submenu = document.querySelector<HTMLElement>('.context-menu-submenu')!;
        expect(root.style.left).toBe('512px');
        expect(root.style.top).toBe('238px');
        expect(submenu).toHaveClass('context-menu-submenu-open-left');
        expect(submenu.style.getPropertyValue('--context-submenu-left')).toBe('292px');
        expect(submenu.style.getPropertyValue('--context-submenu-top')).toBe('212px');

        anchorTop = 120;
        fireEvent.scroll(root);
        expect(submenu.style.getPropertyValue('--context-submenu-top')).toBe('112px');
    });

    test('portals the menu outside transformed and clipped designer ancestors', () => {
        const host = document.createElement('div');
        host.style.transform = 'translateZ(0)';
        host.style.overflow = 'hidden';
        document.body.append(host);

        const {unmount} = render(
            <ContextMenu
                visible
                position={[20, 20]}
                menus={[{
                    name: '选择图层',
                    children: [{name: '图层 A'}],
                }]}
            />,
            {container: host},
        );

        const root = document.querySelector<HTMLElement>('.context-menu-container');
        expect(root?.parentElement).toBe(document.body);
        fireEvent.click(screen.getByText('选择图层'));
        const submenu = document.querySelector<HTMLElement>('.context-menu-submenu');
        expect(submenu?.parentElement).toBe(document.body);
        expect(root?.contains(submenu)).toBe(false);

        unmount();
        host.remove();
    });
});
