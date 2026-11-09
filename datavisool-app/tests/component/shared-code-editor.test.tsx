/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import React from 'react';
import {fireEvent, render} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {CodeEditor, MonacoEditor} from '@datavisool/ui';

const originalRangeBounds = Range.prototype.getBoundingClientRect;

beforeEach(() => {
    Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
        configurable: true,
        value: () => new DOMRect(0, 0, 1, 16),
    });
    Object.defineProperty(Range.prototype, 'getClientRects', {
        configurable: true,
        value: () => [],
    });
});

afterEach(() => {
    if (originalRangeBounds) {
        Object.defineProperty(Range.prototype, 'getBoundingClientRect', {configurable: true, value: originalRangeBounds});
    } else {
        delete (Range.prototype as any).getBoundingClientRect;
    }
    delete (Range.prototype as any).getClientRects;
});

describe('shared UI code editors', () => {
    it('mounts CodeMirror with the selected language and controlled value metadata', () => {
        const onChange = vi.fn();
        const view = render(<CodeEditor label="Source code" language="typescript" value={'const count = 1;'} onChange={onChange} lineNumbers={false} foldGutter={false}/>);

        expect(view.container.querySelector('.CodeMirror')).not.toBeNull();
        expect(view.container.querySelector('.datavisool-code-editor-lang')).toHaveTextContent('TYPESCRIPT');
        expect(view.container.querySelector('.datavisool-code-editor-status')).toHaveTextContent('1 行16 字符');
        expect(view.container.querySelector('.CodeMirror-linenumber')).toBeNull();

        view.rerender(<CodeEditor label="Source code" language="json" value={'{\n  "count": 3\n}'} onChange={onChange} lineNumbers={false} foldGutter={false}/>);

        expect(view.container.querySelector('.datavisool-code-editor-lang')).toHaveTextContent('JSON');
        expect(view.container.querySelector('.datavisool-code-editor-status')).toHaveTextContent('3 行16 字符');
        expect(onChange).not.toHaveBeenCalled();
    });

    it('keeps read-only and disabled CodeMirror inputs non-editable as their props change', () => {
        const view = render(<CodeEditor label="Source code" value="const count = 1;" readOnly/>);
        const input = view.container.querySelector('.CodeMirror textarea') as HTMLTextAreaElement;
        expect(input).toHaveAttribute('readonly');
        expect(view.container.querySelector('.datavisool-code-editor-surface')).toHaveAttribute('data-readonly', 'true');

        view.rerender(<CodeEditor label="Source code" value="const count = 1;" disabled/>);
        expect(input).toHaveAttribute('readonly');
        expect(view.container.querySelector('.datavisool-code-editor-surface')).toHaveAttribute('data-disabled', 'true');

        view.rerender(<CodeEditor label="Source code" value="const count = 1;"/>);
        expect(input).not.toHaveAttribute('readonly');
        expect(view.container.querySelector('.datavisool-code-editor-surface')).not.toHaveAttribute('data-readonly');
        expect(view.container.querySelector('.datavisool-code-editor-surface')).not.toHaveAttribute('data-disabled');
    });

    it('exposes MonacoEditor as a controlled text editor and reports edits', () => {
        const onChange = vi.fn();
        const view = render(<MonacoEditor language="sql" value="select 1" onChange={onChange}/>);
        const input = view.container.querySelector('.datavisool-control') as HTMLTextAreaElement;
        expect(input).toHaveValue('select 1');
        expect(input).toHaveAttribute('data-language', 'sql');

        fireEvent.change(input, {target: {value: 'select 2'}});
        expect(onChange).toHaveBeenCalledWith('select 2');
        view.rerender(<MonacoEditor language="sql" value="select 3" onChange={onChange}/>);
        expect(input).toHaveValue('select 3');
    });

    it('removes CodeMirror instances and its global completion container on unmount', () => {
        const view = render(<CodeEditor label="Source code" value="const count = 1;"/>);
        expect(document.querySelector('.datavisool-code-editor-hints')).not.toBeNull();
        view.unmount();
        expect(document.querySelector('.datavisool-code-editor-hints')).toBeNull();
        expect(view.container.querySelector('.CodeMirror')).toBeNull();
    });
});
