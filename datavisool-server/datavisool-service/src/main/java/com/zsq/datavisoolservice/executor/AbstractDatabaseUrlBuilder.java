/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.executor;

import com.zsq.datavisoolservice.constants.DataBaseEnum;
import com.zsq.datavisoolservice.global.AppException;
import com.zsq.datavisoolservice.global.AppStatusCode;
import com.zsq.datavisoolservice.model.po.CommonDatabasePO;

/**
 * 各类型数据库url驱动连接构建接口，所有接入系统的动态数据库连接，都应该实现该接口
 */
public abstract class AbstractDatabaseUrlBuilder {

    abstract DataBaseEnum getType();

    abstract String buildUrl(CommonDatabasePO commonDatabasePO);

    protected boolean checkParams(CommonDatabasePO commonDatabasePO) {
        if (commonDatabasePO == null)
            throw new RuntimeException("database info is null");
        if (commonDatabasePO.getUrl() != null) {
            if (commonDatabasePO.getIp() == null)
                throw new AppException(AppStatusCode.INVALID_PARAM, "database ip is null");
            if (commonDatabasePO.getPort() == null)
                throw new AppException(AppStatusCode.INVALID_PARAM, "database port is null");
            if (commonDatabasePO.getDatabaseName() == null)
                throw new AppException(AppStatusCode.INVALID_PARAM, "database name is null");
        }
        return true;
    }
}
