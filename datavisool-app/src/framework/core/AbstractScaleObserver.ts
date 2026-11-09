/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

export default abstract class AbstractScaleObserver {

    abstract doScale(xScale: number, yScale: number): void;
}