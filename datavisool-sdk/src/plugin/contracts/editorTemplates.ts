/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {createEventKey} from '../../plugin.js';

/** Emitted after a template was created successfully and its library can refresh. */
export const editorTemplateCreatedKey = createEventKey<void>('app/editor/template-created');
