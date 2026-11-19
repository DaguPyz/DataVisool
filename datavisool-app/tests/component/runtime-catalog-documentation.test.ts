/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {expect, it} from 'vitest';
import {componentDocumentIndex} from '@/plugins/designer-runtime/internal/catalog/componentDocumentation.ts';

it('keeps generated runtime documentation metadata immutable at every exposed level', () => {
    const before = JSON.stringify(componentDocumentIndex);
    expect(componentDocumentIndex.documents).toHaveLength(55);
    expect(componentDocumentIndex.documents.filter(document => document.hasFullSpec)).toHaveLength(48);
    expect(Object.isFrozen(componentDocumentIndex)).toBe(true);
    expect(Object.isFrozen(componentDocumentIndex.documents)).toBe(true);
    for (const document of componentDocumentIndex.documents) {
        expect(Object.isFrozen(document)).toBe(true);
        expect(Object.isFrozen(document.componentInfo)).toBe(true);
        expect(Reflect.set(document.componentInfo, 'description', 'mutated')).toBe(false);
    }
    expect(Reflect.set(componentDocumentIndex, 'corpusVersion', 'mutated')).toBe(false);
    expect(JSON.stringify(componentDocumentIndex)).toBe(before);
});
