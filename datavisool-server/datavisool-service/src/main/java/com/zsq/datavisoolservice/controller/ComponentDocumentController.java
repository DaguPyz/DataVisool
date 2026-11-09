/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.controller;

import com.zsq.datavisoolcommon.model.response.ApiResponse;
import com.zsq.datavisoolservice.service.impl.ai.ComponentDocumentParser.DocumentException;
import com.zsq.datavisoolservice.service.impl.ai.ComponentDocumentService;
import com.zsq.datavisoolservice.util.AppContextUtil;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController
@RequestMapping("/api/component-documents")
public class ComponentDocumentController {
    private final ComponentDocumentService documents;
    public ComponentDocumentController(ComponentDocumentService documents) {this.documents = documents;}
    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN', 'ADMIN', 'USER')")
    @PostMapping("/{operation}")
    public ApiResponse<Object> execute(@PathVariable String operation, @RequestBody Map<String, Object> request) {
        var user = AppContextUtil.getCurrentUser();
        try {return ApiResponse.success(documents.execute(operation, request, user == null ? null : user.getId()));}
        catch (DocumentException e) {return ApiResponse.success(Map.of("status", "error", "code", e.code, "message", e.getMessage()));}
    }
}
