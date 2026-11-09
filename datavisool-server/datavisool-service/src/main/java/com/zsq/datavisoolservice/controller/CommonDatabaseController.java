/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.controller;

import com.alibaba.fastjson.JSON;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.zsq.datavisoolcommon.model.response.ApiResponse;
import com.zsq.datavisoolservice.model.dto.CommonDataBaseDTO;
import com.zsq.datavisoolservice.model.dto.EncryptResultDTO;
import com.zsq.datavisoolservice.model.dto.PageParamDTO;
import com.zsq.datavisoolservice.model.query.DatabaseEncryptQuery;
import com.zsq.datavisoolservice.security.HybridCryptoUtil;
import com.zsq.datavisoolservice.service.CommonDatabaseService;
import jakarta.annotation.Resource;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/commonDatabase")
@PreAuthorize("hasAnyRole('SYSTEM_ADMIN', 'ADMIN', 'USER')")
public class CommonDatabaseController {

    @Resource
    private CommonDatabaseService commonDatabaseService;

    @PostMapping("/get")
    public ApiResponse<EncryptResultDTO> getDatabase(@RequestBody DatabaseEncryptQuery query) throws Exception {
        CommonDataBaseDTO database = commonDatabaseService.getDatabase(query);
        String dtoJson = JSON.toJSONString(database);
        EncryptResultDTO encrypt = HybridCryptoUtil.encrypt(dtoJson, query.getKey());
        return ApiResponse.success(encrypt);
    }

    @GetMapping("/list")
    public ApiResponse<List<CommonDataBaseDTO>> getDatabaseList() {
        return ApiResponse.success(commonDatabaseService.getDatabaseList());
    }

    @PostMapping("/pageList")
    public ApiResponse<Page<CommonDataBaseDTO>> getDatabasePageList(@RequestBody PageParamDTO pageParamDTO) {
        return ApiResponse.success(commonDatabaseService.getDatabasePageList(pageParamDTO));
    }

    @PostMapping("/add")
    public ApiResponse<Long> addDatabase(@RequestBody EncryptResultDTO encryptResultDTO) {
        String decrypt = HybridCryptoUtil.decrypt(encryptResultDTO);
        CommonDataBaseDTO encryptDTO = JSON.parseObject(decrypt, CommonDataBaseDTO.class);
        return ApiResponse.success(commonDatabaseService.addDatabase(encryptDTO));
    }

    @PostMapping("/update")
    public ApiResponse<Boolean> updateDatabase(@RequestBody EncryptResultDTO encryptResultDTO) {
        String decrypt = HybridCryptoUtil.decrypt(encryptResultDTO);
        CommonDataBaseDTO encryptDTO = JSON.parseObject(decrypt, CommonDataBaseDTO.class);
        return ApiResponse.success(commonDatabaseService.updateDatabase(encryptDTO));
    }

    @GetMapping("/copy/{id}")
    public ApiResponse<Boolean> copyDatabase(@PathVariable Long id) {
        return ApiResponse.success(commonDatabaseService.copyDatabase(id));
    }

    @GetMapping("/del/{id}")
    public ApiResponse<Boolean> delDatabase(@PathVariable Long id) {
        return ApiResponse.success(commonDatabaseService.delDatabase(id));
    }

    @PostMapping("/batchDel")
    public ApiResponse<Boolean> batchDelDatabase(@RequestBody List<Long> ids) {
        return ApiResponse.success(commonDatabaseService.batchDelDatabase(ids));
    }

    @GetMapping("/test/{id}")
    public ApiResponse<Boolean> testDatabaseConnect(@PathVariable Long id) {
        return ApiResponse.success("链接正常", commonDatabaseService.testDatabaseConnect(id));
    }

}
