/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it} from 'vitest';
import {DesignerMode} from '@datavisool/sdk/types';
import BaseTableComponent from '@/comps/builtin/base-table/BaseTableComponent.tsx';

describe('BaseTableComponent', () => {
    afterEach(() => {
        delete (window as any).DATAVISOOL_ENV;
    });

    it('renders configured columns and row data without edit-mode observers', () => {
        (window as any).DATAVISOOL_ENV = {mode: DesignerMode.PREVIEW};

        render(
            <BaseTableComponent
                style={{
                    columns: [
                        {key: 'name', label: '名称', width: 120},
                        {key: 'value', label: '数值', textAlign: 'right'},
                    ],
                    data: [
                        {name: '设备 A', value: 32},
                        {name: '设备 B', value: 45},
                    ],
                    header: {height: 36},
                    body: {pageSize: 2},
                }}
            />
        );

        expect(screen.getByText('名称')).toBeInTheDocument();
        expect(screen.getByText('数值')).toBeInTheDocument();
        expect(screen.getByText('设备 A')).toBeInTheDocument();
        expect(screen.getByText('设备 B')).toBeInTheDocument();
        expect(screen.getByText('45')).toBeInTheDocument();
    });

    it('uses current carousel fields without interpreting old fields', async () => {
        const {BaseTableController} = await import('@/comps/builtin/base-table/BaseTableController.ts');
        const controller = new BaseTableController();
        controller.config = {style: {body: {autoScroll: true, scrollSpeed: 9, pauseSeconds: 2}}} as any;
        expect(controller.getConfig()?.style?.body).toMatchObject({
            enableCarousel: false, carouselSpeed: 3, carouselPauseSeconds: 0.08,
        });
        controller.config = {style: {body: {enableCarousel: true, carouselSpeed: 4, carouselPauseSeconds: 1}}} as any;
        expect(controller.getConfig()?.style?.body).toMatchObject({
            enableCarousel: true, carouselSpeed: 4, carouselPauseSeconds: 1,
        });
    });
});
