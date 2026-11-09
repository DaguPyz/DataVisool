/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {fireEvent, render, screen, within} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {BaseTabStyleConfig} from '@/comps/builtin/base-tab/BaseTabStyleConfig';
import {DigitalFlipperConfig} from '@/comps/builtin/digital-flipper/DigitalFlipperConfig';
import {TextScrollerConfig} from '@/comps/builtin/text-scroller/TextScrollerConfig';

type Style = Record<string, any>;

function makeController(style: Style) {
    const config = {style};
    const update = vi.fn((fragment: {style?: Style}) => {
        config.style = {...config.style, ...fragment.style};
    });
    return {config, controller: {getConfig: () => config, update}};
}

function numberInput(container: HTMLElement, label: string) {
    const labelNode = within(container).getByText(label, {selector: '.datavisool-field-label-text'});
    const input = labelNode.closest('.datavisool-field')?.querySelector<HTMLInputElement>('input[type="number"]');
    if (!input) throw new Error(`Missing numeric field: ${label}`);
    return input;
}

function selectControl(container: HTMLElement, label: string) {
    const labelNode = within(container).getByText(label, {selector: '.datavisool-field-label-text'});
    const select = labelNode.closest('.datavisool-field')?.querySelector<HTMLButtonElement>('[role="combobox"]');
    if (!select) throw new Error(`Missing select field: ${label}`);
    return select;
}

function openAccordion(label: string) {
    const trigger = screen.getByRole('button', {name: label});
    if (trigger.getAttribute('aria-expanded') !== 'true') fireEvent.click(trigger);
    const contentId = trigger.getAttribute('aria-controls');
    const content = contentId ? document.getElementById(contentId) : null;
    if (!content) throw new Error(`Missing accordion content: ${label}`);
    return content;
}

describe('additional built-in GUI configuration fields', () => {
    beforeEach(() => {
        window.DATAVISOOL_ENV = {fonts: [
            {label: 'Arial', value: 'Arial'},
            {label: 'Roboto', value: 'Roboto'},
        ]} as never;
    });

    it('preserves BaseTab zero-valued spacing and style fields after remount, and writes other controls', () => {
        const {config, controller} = makeController({
            mode: 'single',
            layout: 'horizontal',
            flexWrap: false,
            itemGap: 12,
            containerRadius: 10,
            containerPadding: 8,
            containerBorderWidth: 2,
            itemRadius: 6,
            itemBorderWidth: 1,
        });
        const view = render(<BaseTabStyleConfig controller={controller as never}/>);

        const basics = openAccordion('基础设置');
        const gap = numberInput(basics, '选项间距');
        expect(gap).toHaveAttribute('min', '0');
        expect(gap).toHaveAttribute('max', '100');
        fireEvent.change(gap, {target: {value: '0'}});
        expect(controller.update).toHaveBeenLastCalledWith({style: {itemGap: 0}});
        expect(config.style.itemGap).toBe(0);

        fireEvent.click(selectControl(basics, '选择模式'));
        fireEvent.click(screen.getByRole('option', {name: '多选'}));
        expect(controller.update).toHaveBeenLastCalledWith({style: {mode: 'multiple'}});
        fireEvent.click(within(basics).getByRole('switch'));
        expect(controller.update).toHaveBeenLastCalledWith({style: {flexWrap: true}});

        const container = openAccordion('容器样式');
        for (const label of ['容器圆角', '内边距', '边框宽度']) {
            const input = numberInput(container, label);
            expect(input).toHaveAttribute('min', '0');
            fireEvent.change(input, {target: {value: '0'}});
            const field = label === '容器圆角' ? 'containerRadius'
                : label === '内边距' ? 'containerPadding' : 'containerBorderWidth';
            expect(controller.update).toHaveBeenLastCalledWith({style: {[field]: 0}});
        }

        const defaultItem = openAccordion('按钮样式 (默认)');
        for (const [label, field] of [['按钮圆角', 'itemRadius'], ['边框宽度', 'itemBorderWidth']] as const) {
            const input = numberInput(defaultItem, label);
            expect(input).toHaveAttribute('min', '0');
            fireEvent.change(input, {target: {value: '0'}});
            expect(controller.update).toHaveBeenLastCalledWith({style: {[field]: 0}});
        }

        view.unmount();
        const reopened = render(<BaseTabStyleConfig controller={controller as never}/>);
        const reopenedBasics = openAccordion('基础设置');
        expect(numberInput(reopenedBasics, '选项间距')).toHaveValue(0);
        const reopenedContainer = openAccordion('容器样式');
        expect(numberInput(reopenedContainer, '容器圆角')).toHaveValue(0);
        expect(numberInput(reopenedContainer, '内边距')).toHaveValue(0);
        expect(numberInput(reopenedContainer, '边框宽度')).toHaveValue(0);
        const reopenedItems = openAccordion('按钮样式 (默认)');
        expect(numberInput(reopenedItems, '按钮圆角')).toHaveValue(0);
        expect(numberInput(reopenedItems, '边框宽度')).toHaveValue(0);

        fireEvent.change(numberInput(reopenedBasics, '选项间距'), {target: {value: '100'}});
        expect(controller.update).toHaveBeenLastCalledWith({style: {itemGap: 100}});
        reopened.unmount();
    });

    it('writes DigitalFlipper text, numeric boundaries, type, and font settings', () => {
        const {controller} = makeController({
            prefix: '$', suffix: '件', decimalPlaces: 2, separator: ',', duration: 1.5,
            fontSize: 20, fontWeight: 400, type: 'slide', fontFamily: 'Arial',
        });
        render(<DigitalFlipperConfig controller={controller as never}/>);

        const prefixField = screen.getByText('前缀', {selector: '.datavisool-field-label-text'})
            .closest('.datavisool-field')?.querySelector<HTMLInputElement>('input');
        expect(prefixField).not.toBeNull();
        fireEvent.change(prefixField as HTMLInputElement, {target: {value: '¥'}});
        expect(controller.update).toHaveBeenLastCalledWith({style: {prefix: '¥'}});

        const duration = numberInput(document.body, '动画时长');
        expect(duration).toHaveAttribute('min', '0');
        fireEvent.change(duration, {target: {value: '0'}});
        expect(controller.update).toHaveBeenLastCalledWith({style: {duration: 0}});

        const fontWeight = numberInput(document.body, '粗细');
        expect(fontWeight).toHaveAttribute('max', '900');
        fireEvent.change(fontWeight, {target: {value: '900'}});
        expect(controller.update).toHaveBeenLastCalledWith({style: {fontWeight: 900}});

        fireEvent.click(selectControl(document.body, '类型'));
        fireEvent.click(screen.getByRole('option', {name: '跳动'}));
        expect(controller.update).toHaveBeenLastCalledWith({style: {type: 'caper'}});
        fireEvent.click(selectControl(document.body, '字体'));
        fireEvent.click(screen.getByRole('option', {name: 'Roboto'}));
        expect(controller.update).toHaveBeenLastCalledWith({style: {fontFamily: 'Roboto'}});
    });

    it('writes TextScroller speed, typography limits, and font selection', () => {
        const {controller} = makeController({speed: 0.5, fontSize: 16, fontWeight: 500, color: '#ffffff', fontFamily: 'Arial'});
        render(<TextScrollerConfig controller={controller as never}/>);

        const speed = numberInput(document.body, '速度');
        expect(speed).toHaveAttribute('min', '0');
        fireEvent.change(speed, {target: {value: '0'}});
        expect(controller.update).toHaveBeenLastCalledWith({style: {speed: 0}});

        const fontSize = numberInput(document.body, '字号');
        expect(fontSize).toHaveAttribute('min', '1');
        expect(fontSize).toHaveAttribute('max', '100');
        fireEvent.change(fontSize, {target: {value: '100'}});
        expect(controller.update).toHaveBeenLastCalledWith({style: {fontSize: 100}});

        const fontWeight = numberInput(document.body, '加粗');
        expect(fontWeight).toHaveAttribute('min', '100');
        expect(fontWeight).toHaveAttribute('max', '900');
        fireEvent.change(fontWeight, {target: {value: '100'}});
        expect(controller.update).toHaveBeenLastCalledWith({style: {fontWeight: 100}});

        fireEvent.click(selectControl(document.body, '字体'));
        fireEvent.click(screen.getByRole('option', {name: 'Roboto'}));
        expect(controller.update).toHaveBeenLastCalledWith({style: {fontFamily: 'Roboto'}});
    });
});
