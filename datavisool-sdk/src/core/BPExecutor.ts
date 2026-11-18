/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
/** Blueprint event contract. The host supplies the execution engine. */
export default abstract class BPExecutor {
    constructor(..._hostArgs: any[]) {}

    public abstract triggerComponentEvent(componentId: string, eventId: string, params: any, index?: number): void;
}
