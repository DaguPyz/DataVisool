/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {fireEvent, render, screen, within} from '@testing-library/react';
import {describe, expect, test, vi} from 'vitest';

vi.mock('@/i18n/miniI18n.ts', () => ({tx: (value: string) => value}));

import AiDrivenInlineInteraction from '@/designer/ai-driven/AiDrivenInlineInteraction.tsx';
import type {IAiDrivenInlineInteraction} from '@/designer/ai-driven/AiDrivenProgressTerminalStore.ts';

const interaction: IAiDrivenInlineInteraction = {
    id: 'questions-1',
    kind: 'userInput',
    title: '补充设计需求',
    questions: [
        {id: 'style', header: '视觉风格', question: '请选择界面风格', options: [
            {label: '科技蓝', description: '蓝色主调'},
            {label: '简洁灰', description: '灰色主调'},
        ]},
        {id: 'layout', header: '布局方向', question: '请选择组件排列方式', options: [
            {label: '横向布局', description: '左右排列内容'},
            {label: '纵向布局', description: '上下排列内容'},
        ]},
    ],
};

describe('AI supplementary questions', () => {
    test('requires every answer and submits custom and preset answers by question ID', () => {
        const onComplete = vi.fn();
        render(<AiDrivenInlineInteraction interaction={interaction} onComplete={onComplete}/>);
        const submit = screen.getByRole('button', {name: '提交选择'});
        expect(submit).toBeDisabled();
        const style = within(screen.getByRole('group', {name: '视觉风格 · 请选择界面风格'}));
        fireEvent.click(style.getByRole('radio', {name: '其他'}));
        fireEvent.change(style.getByPlaceholderText('请输入自定义答案'), {target: {value: '   '}});
        fireEvent.click(screen.getByRole('radio', {name: '横向布局左右排列内容'}));
        expect(submit).toBeDisabled();
        fireEvent.change(style.getByPlaceholderText('请输入自定义答案'), {target: {value: ' 紫色简约 '}});
        expect(submit).toBeEnabled();
        fireEvent.click(submit);
        expect(onComplete).toHaveBeenCalledTimes(1);
        expect(onComplete).toHaveBeenCalledWith({action: 'submit', data: {answers: {
            style: {answers: ['紫色简约']},
            layout: {answers: ['横向布局']},
        }}});
    });

    test('switches from a custom answer back to a preset without retaining the custom value', () => {
        const onComplete = vi.fn();
        render(<AiDrivenInlineInteraction interaction={interaction} onComplete={onComplete}/>);
        const style = within(screen.getByRole('group', {name: '视觉风格 · 请选择界面风格'}));
        fireEvent.click(style.getByRole('radio', {name: '其他'}));
        fireEvent.change(style.getByPlaceholderText('请输入自定义答案'), {target: {value: '自定义主题'}});
        fireEvent.click(style.getByRole('radio', {name: '科技蓝蓝色主调'}));
        expect(style.queryByPlaceholderText('请输入自定义答案')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('radio', {name: '纵向布局上下排列内容'}));
        fireEvent.click(screen.getByRole('button', {name: '提交选择'}));
        expect(onComplete).toHaveBeenCalledWith({action: 'submit', data: {answers: {
            style: {answers: ['科技蓝']},
            layout: {answers: ['纵向布局']},
        }}});
    });

    test('cancels without submitting unanswered questions', () => {
        const onComplete = vi.fn();
        render(<AiDrivenInlineInteraction interaction={interaction} onComplete={onComplete}/>);
        fireEvent.click(screen.getByRole('button', {name: '取消'}));
        expect(onComplete).toHaveBeenCalledTimes(1);
        expect(onComplete).toHaveBeenCalledWith({action: 'cancel'});
    });
});
