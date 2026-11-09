/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {fireEvent, render, screen, within} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {BaseTextStyleConfig} from '@/comps/builtin/base-text/BaseTextConfig';
import {BaseButtonStyleConfig} from '@/comps/builtin/base-button/BaseButtonConfig';
import {BaseInputStyleConfig} from '@/comps/builtin/base-input/BaseInputConfig';
import {BaseSelectStyleConfig} from '@/comps/builtin/base-select/BaseSelectConfig';
import {BaseTableStyleConfig} from '@/comps/builtin/base-table/BaseTableConfig';

function makeController(config: Record<string, any>) {
    return {getConfig: () => config, update: vi.fn()};
}

function changeNumber(value: string, nextValue: string) {
    fireEvent.change(screen.getByDisplayValue(value), {target: {value: nextValue}});
}

function chooseOption(select: HTMLElement, optionName: string) {
    fireEvent.click(select);
    fireEvent.click(screen.getByRole('option', {name: optionName}));
}

describe('built-in GUI config field writes', () => {
    beforeEach(() => {
        window.DATAVISOOL_ENV = {fonts: [
            {label: 'Arial', value: 'Arial'},
            {label: 'Roboto', value: 'Roboto'},
        ]} as never;
    });

    it('writes BaseText content, numeric style, and alignment through their nested paths', () => {
        const controller = makeController({
            data: {value: '旧文本'},
            style: {fontSize: 12, letterSpacing: 0, lineHeight: 1.5, textAlign: 'left'},
        });
        const view = render(<BaseTextStyleConfig controller={controller as never}/>);

        fireEvent.change(screen.getByDisplayValue('旧文本'), {target: {value: '新文本'}});
        expect(controller.update).toHaveBeenLastCalledWith({data: {value: '新文本'}});
        changeNumber('12', '18');
        expect(controller.update).toHaveBeenLastCalledWith({style: {fontSize: 18}});
        expect(view.container.querySelector('input[type="number"]')).toHaveValue(18);

        const textAlignment = view.container.querySelector('[role="radiogroup"]');
        expect(textAlignment).not.toBeNull();
        fireEvent.click(within(textAlignment as HTMLElement).getAllByRole('radio')[1]);
        expect(controller.update).toHaveBeenLastCalledWith({style: {textAlign: 'center'}});
    });

    it('writes BaseButton text, zero-valued radius, and select fields', () => {
        const controller = makeController({style: {
            content: '继续', borderRadius: 4, borderStyle: 'solid', color: '#112233',
        }});
        const view = render(<BaseButtonStyleConfig controller={controller as never}/>);
        fireEvent.click(screen.getByRole('button', {name: '基础'}));

        fireEvent.change(screen.getByDisplayValue('继续'), {target: {value: '确认'}});
        expect(controller.update).toHaveBeenLastCalledWith({style: {content: '确认'}});
        changeNumber('4', '0');
        expect(controller.update).toHaveBeenLastCalledWith({style: {borderRadius: 0}});

        chooseOption(screen.getAllByRole('combobox')[1], '虚线');
        expect(controller.update).toHaveBeenLastCalledWith({style: {borderStyle: 'dashed'}});

        fireEvent.click(view.container.querySelectorAll('button[aria-haspopup="dialog"]')[0]);
        fireEvent.change(screen.getByLabelText('选择颜色颜色'), {target: {value: '#abcdef'}});
        expect(controller.update).toHaveBeenLastCalledWith({style: {color: '#abcdef'}});
    });

    it('writes BaseInput zero-valued radius and font selection', () => {
        const controller = makeController({style: {borderRadius: 4, fontFamily: 'Arial'}});
        render(<BaseInputStyleConfig controller={controller as never}/>);
        fireEvent.click(screen.getByRole('button', {name: '基础'}));

        changeNumber('4', '0');
        expect(controller.update).toHaveBeenLastCalledWith({style: {borderRadius: 0}});
        chooseOption(screen.getAllByRole('combobox')[0], 'Roboto');
        expect(controller.update).toHaveBeenLastCalledWith({style: {fontFamily: 'Roboto'}});
    });

    it('writes BaseSelect zero line width and option height to style', () => {
        const controller = makeController({style: {lineWidth: 1, optionHeight: 32}});
        render(<BaseSelectStyleConfig controller={controller as never}/>);
        fireEvent.click(screen.getByRole('button', {name: '基础'}));
        fireEvent.click(screen.getByRole('button', {name: '下拉选项'}));

        changeNumber('32', '36');
        expect(controller.update).toHaveBeenLastCalledWith({style: {optionHeight: 36}});
        changeNumber('1', '0');
        expect(controller.update).toHaveBeenLastCalledWith({style: {lineWidth: 0}});
    });

    it('writes BaseTable zero height, carousel switch, and nested column edits', () => {
        const controller = makeController({style: {
            header: {height: 32},
            body: {enableCarousel: false, carouselSpeed: 2, carouselPauseSeconds: 0.08, pageSize: 10},
            columns: [{key: 'name', width: 120, label: '名称', textAlign: 'left'}],
        }});
        render(<BaseTableStyleConfig controller={controller as never}/>);

        fireEvent.click(screen.getByRole('button', {name: '表头'}));
        changeNumber('32', '0');
        expect(controller.update).toHaveBeenLastCalledWith({style: {header: {height: 0}}});

        fireEvent.click(screen.getByRole('button', {name: '表体'}));
        fireEvent.click(screen.getByRole('switch'));
        expect(controller.update).toHaveBeenLastCalledWith({style: {body: {enableCarousel: true}}});

        fireEvent.click(screen.getByRole('button', {name: /表格列/}));
        fireEvent.change(screen.getByDisplayValue('name'), {target: {value: 'title'}});
        expect(controller.update).toHaveBeenLastCalledWith({style: {
            columns: [{key: 'title', width: 120, label: '名称', textAlign: 'left'}],
        }});
    });

    it('writes BaseTable page size and keeps the other zebra-row color when editing one color', () => {
        const controller = makeController({style: {
            body: {
                pageSize: 5,
                lineBackground: ['#112233', '#445566'],
            },
        }});
        render(<BaseTableStyleConfig controller={controller as never}/>);

        fireEvent.click(screen.getByRole('button', {name: '表体'}));
        changeNumber('5', '8');
        expect(controller.update).toHaveBeenLastCalledWith({style: {body: {pageSize: 8}}});

        const colors = screen.getByRole('list', {name: '多色选择'});
        const firstRowColor = within(within(colors).getAllByRole('listitem')[0]).getByRole('button', {name: '单色'});
        fireEvent.click(firstRowColor);
        fireEvent.change(screen.getByLabelText('选择颜色颜色'), {target: {value: '#abcdef'}});
        expect(controller.update).toHaveBeenLastCalledWith({style: {
            body: {lineBackground: ['#abcdef', '#445566']},
        }});
    });
});
