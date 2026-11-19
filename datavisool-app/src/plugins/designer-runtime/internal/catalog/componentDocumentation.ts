/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import index from './generated/component-document-index.json';
import type {ComponentDocumentInfo} from '@/shared/components/ComponentDocumentationTypes.ts';

type Documentation = Readonly<Omit<ComponentDocumentInfo, 'componentInfo'>> & {
    readonly componentInfo: Readonly<ComponentDocumentInfo['componentInfo']>;
};

/** Runtime-owned generated metadata. Neither this asset nor the catalog contains document bodies. */
export const componentDocumentIndex: Readonly<{
    corpusVersion: string;
    documents: readonly Documentation[];
}> = Object.freeze({
    corpusVersion: index.corpusVersion,
    documents: Object.freeze(index.documents.map(document => Object.freeze({
        ...document,
        componentInfo: Object.freeze({...document.componentInfo}),
    }))),
});
