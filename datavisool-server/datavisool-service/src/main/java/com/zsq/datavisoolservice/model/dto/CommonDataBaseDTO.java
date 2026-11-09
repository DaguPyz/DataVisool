/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.model.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.zsq.datavisoolservice.constants.DataBaseEnum;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 数据源管理
 */
@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class CommonDataBaseDTO implements Serializable {
    /**
     * id
     */
    @JsonFormat(shape = JsonFormat.Shape.STRING)
    private Long id;

    /**
     * 数据源链接名称
     */
    private String name;

    /**
     * 数据源类型
     */
    @JsonFormat(shape = JsonFormat.Shape.STRING)
    private DataBaseEnum type;

    /**
     * 数据源链接地址
     */
    private String url;

    /**
     * 是否允许执行脚本
     */
    private Boolean allowSqlScript;

    /**
     * ip/域名
     */
    private String ip;

    /**
     * 端口
     */
    private String port;

    /**
     * 数据库名
     */
    private String databaseName;

    /**
     * 用户名
     */
    private String username;

    /**
     * 数据源链接密码
     */
    private String password;

    /**
     * 数据源链接描述
     */
    private String des;

    /**
     * 用户id
     */
    @JsonFormat(shape = JsonFormat.Shape.STRING)
    private Long userId;

    /**
     * 创建时间
     */
    private LocalDateTime createTime;

    /**
     * 更新时间
     */
    private LocalDateTime updateTime;

    /**
     * 逻辑删除
     */
    private Integer deleted;

}
