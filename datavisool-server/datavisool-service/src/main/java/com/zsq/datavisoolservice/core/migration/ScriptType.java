/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
package com.zsq.datavisoolservice.core.migration;

import lombok.Getter;
import org.apache.commons.lang3.StringUtils;

@Getter
public enum ScriptType {

    UPGRADE("V"),

    ROLLBACK("R");

    private final String prefix;

    ScriptType(String prefix) {
        this.prefix = prefix;
    }

    public static ScriptType of(String version) {
        if (StringUtils.isBlank(version)) {
            return null;
        }
        if (version.startsWith(UPGRADE.getPrefix())) {
            return UPGRADE;
        } else if (version.startsWith(ROLLBACK.getPrefix())) {
            return ROLLBACK;
        } else {
            return null;
        }
    }
}
