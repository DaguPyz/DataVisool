/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

export const getController = (id: string) => {
    return window.DATAVISOOL_ENV?.currentManager?.layerManager?.controllers[id];
}