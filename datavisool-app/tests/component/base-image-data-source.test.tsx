/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {describe, expect, it, vi} from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
    convertFileSrc: vi.fn((path: string) => `converted://${path}`)
}));

import {act, render, screen, waitFor} from '@testing-library/react';
import BaseImageComponent from '@/comps/builtin/base-image/BaseImageComponent.tsx';
import BaseImageController from '@/comps/builtin/base-image/BaseImageController.ts';
import BPExecutor from '@/designer/blueprint/core/BPExecutor';

describe('BaseImageComponent data source support', () => {
    it('uses the data source value before the style source', () => {
        render(
            <BaseImageComponent
                style={{
                    type: 'online',
                    onLineUrl: 'https://example.com/style.png',
                    opacity: 0.6,
                }}
                data={{
                    sourceType: 'static',
                    value: {url: 'https://example.com/data.png'},
                }}
            />
        );

        expect(screen.getByAltText('图片组件')).toHaveAttribute('src', 'https://example.com/data.png');
    });

    it('loads a static image path from the site root', () => {
        render(<BaseImageComponent style={{type: 'online', onLineUrl: '/static/images/example.png'}} />);
        expect(screen.getByAltText('图片组件')).toHaveAttribute('src', '/static/images/example.png');
    });

    it('falls back to the style source when the data value is empty', () => {
        render(
            <BaseImageComponent
                style={{
                    type: 'local',
                    localUrl: 'https://example.com/style.png',
                }}
                data={{
                    sourceType: 'static',
                    value: '',
                }}
            />
        );

        expect(screen.getByAltText('图片组件')).toHaveAttribute('src', 'https://example.com/style.png');
    });

    it('shows the placeholder when neither data nor style can resolve a source', () => {
        render(
            <BaseImageComponent
                style={{
                    type: 'online',
                    onLineUrl: '',
                }}
                data={{
                    sourceType: 'static',
                    value: '',
                }}
            />
        );

        expect(screen.getByText('请配置图片链接、上传图片或绑定数据源')).toBeInTheDocument();
    });

    it('loads an imported static image value through the Web host and displays the rewritten address', async () => {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const controller = new BaseImageController();
        const config = {base: {id: 'image'}, data: {sourceType: 'static', staticData: {value: {data: {url: 'images/imported.png'}}}}};
        try {
            let creation!: Promise<void>;
            await act(async () => { creation = controller.create(container, config as any, new BPExecutor({} as any)); });
            await creation;
            controller.loadComponentData();
            await waitFor(() => expect(container.querySelector('img')).toHaveAttribute('src', 'images/imported.png'));
        } finally {
            await act(async () => controller.destroy());
            container.remove();
        }
    });
});
