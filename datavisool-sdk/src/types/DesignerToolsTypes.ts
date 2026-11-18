/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

/** @deprecated The main editor ruler no longer exposes an imperative ref. */
export interface DesignerRulerRef {
    ruleWheel: () => void;
    ruleDrag: () => void;
}

export type ClazzTemplate<C> = new () => C | null;
