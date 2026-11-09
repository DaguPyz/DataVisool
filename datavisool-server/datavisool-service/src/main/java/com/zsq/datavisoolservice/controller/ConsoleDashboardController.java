/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.controller;

import com.zsq.datavisoolcommon.model.response.ApiResponse;
import com.zsq.datavisoolservice.model.dto.ConsoleDashboardDTO;
import com.zsq.datavisoolservice.service.ConsoleDashboardService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/console")
@RequiredArgsConstructor
public class ConsoleDashboardController {

    private final ConsoleDashboardService consoleDashboardService;

    @GetMapping("/dashboard")
    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN', 'ADMIN', 'USER')")
    public ApiResponse<ConsoleDashboardDTO> getDashboard() {
        return ApiResponse.success(consoleDashboardService.getDashboard());
    }
}
