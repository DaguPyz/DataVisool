/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.model.dto;

import lombok.Data;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.List;

@Data
public class ConsoleDashboardDTO implements Serializable {
    private Long projectCount = 0L;
    private Long fontCount = 0L;
    private Long videoCount = 0L;
    private Long modelCount = 0L;
    private Long dynamicScriptCount = 0L;
    private Long releaseCount = 0L;
    private Long activeProjectCount = 0L;
    private List<ConsoleRecentActivityDTO> recentActivities = new ArrayList<>();
}
