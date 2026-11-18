/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
type Primitive = string | number | boolean | object | null | undefined;
export type BaseType = Primitive;
export type BaseDataType = BaseType | Record<string, BaseType>;
export type ControlValueType = BaseDataType | BaseDataType[];
