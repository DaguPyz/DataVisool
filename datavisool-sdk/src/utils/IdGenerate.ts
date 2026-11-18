/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {customAlphabet} from "nanoid";

class IdGenerate {

    public static generateId(): string {
        const generateUniqueId = customAlphabet('1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ', 10);
        return generateUniqueId();
    }
}

export default IdGenerate;

