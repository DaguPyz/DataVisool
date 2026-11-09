/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service;

import com.zsq.datavisoolservice.model.dto.WebUpdateCheckDTO;

public interface WebUpdateService {
    WebUpdateCheckDTO check(String currentVersion, boolean includeSkipped);

    boolean skip(String latestVersion);
}
