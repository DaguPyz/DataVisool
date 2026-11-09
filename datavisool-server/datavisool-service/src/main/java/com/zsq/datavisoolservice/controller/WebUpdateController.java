/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.controller;

import com.zsq.datavisoolcommon.model.response.ApiResponse;
import com.zsq.datavisoolservice.model.dto.WebUpdateCheckDTO;
import com.zsq.datavisoolservice.model.dto.WebUpdateSkipDTO;
import com.zsq.datavisoolservice.service.WebUpdateService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/webUpdate")
@PreAuthorize("hasAnyRole('SYSTEM_ADMIN')")
@RequiredArgsConstructor
public class WebUpdateController {
    private final WebUpdateService webUpdateService;

    @GetMapping("/check")
    public ApiResponse<WebUpdateCheckDTO> check(@RequestParam String currentVersion,
                                              @RequestParam(defaultValue = "false") boolean includeSkipped) {
        return ApiResponse.success(webUpdateService.check(currentVersion, includeSkipped));
    }

    @PostMapping("/skip")
    public ApiResponse<Boolean> skip(@RequestBody WebUpdateSkipDTO request) {
        return ApiResponse.success(webUpdateService.skip(request == null ? null : request.getLatestVersion()));
    }
}
