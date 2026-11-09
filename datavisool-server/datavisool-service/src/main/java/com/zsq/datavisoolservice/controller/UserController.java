/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.controller;

import com.alibaba.fastjson.JSON;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.zsq.datavisoolservice.model.dto.EncryptResultDTO;
import com.zsq.datavisoolservice.model.dto.PageParamDTO;
import com.zsq.datavisoolservice.model.dto.UserDTO;
import com.zsq.datavisoolservice.model.po.UserPO;
import com.zsq.datavisoolservice.security.HybridCryptoUtil;
import com.zsq.datavisoolcommon.model.response.ApiResponse;
import com.zsq.datavisoolservice.service.UserService;
import jakarta.annotation.Resource;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/user")
public class UserController {
    @Resource
    private UserService userService;

    @PostMapping("/pageList")
    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN')")
    public ApiResponse<Page<UserPO>> getProjectPageList(@RequestBody PageParamDTO pageParamDTO) {
        return ApiResponse.success(userService.getUserPageList(pageParamDTO));
    }

    @GetMapping("/getUser/{id}")
    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN', 'ADMIN', 'USER')")
    public ApiResponse<UserDTO> getUser(@PathVariable(name = "id") Long id) {
        UserDTO user = userService.getUser(id);
        return ApiResponse.success(user);
    }

    @PostMapping("/update")
    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN', 'ADMIN', 'USER')")
    public ApiResponse<Boolean> updateUser(@RequestBody EncryptResultDTO encryptResultDTO) {
        UserDTO user = JSON.parseObject(HybridCryptoUtil.decrypt(encryptResultDTO), UserDTO.class);
        return ApiResponse.success(userService.updateUser(user));
    }

    @PostMapping("/create")
    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN')")
    public ApiResponse<Long> createUser(@RequestBody UserDTO user) {
        return ApiResponse.success(userService.addUser(user));
    }

    @PostMapping("/createEncrypted")
    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN')")
    public ApiResponse<Long> createUserEncrypted(@RequestBody EncryptResultDTO encrypted) {
        UserDTO user = JSON.parseObject(HybridCryptoUtil.decrypt(encrypted), UserDTO.class);
        return ApiResponse.success(userService.addUser(user));
    }

    @PostMapping("/batchDel")
    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN')")
    public ApiResponse<Boolean> batchDelUser(@RequestBody List<Long> ids) {
        return ApiResponse.success(userService.batchDelUser(ids));
    }

}
