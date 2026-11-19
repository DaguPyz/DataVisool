/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import type {AbstractController, AbstractDesignerController} from '@datavisool/sdk/core';

export interface ConfigType<T extends AbstractController = AbstractDesignerController> {
    controller: T;
}
