/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.executor;

import com.zsq.datavisoolservice.constants.DataBaseEnum;
import com.zsq.datavisoolservice.model.po.CommonDatabasePO;

import java.util.regex.Pattern;

public class SqlServerUrlBuilder extends AbstractDatabaseUrlBuilder {

    private static final String SQLSERVER_URL_REGEX = "^jdbc:sqlserver://([a-zA-Z0-9._-]+)(:\\d{1,5})?;(databaseName=([a-zA-Z0-9._-]+))?(;.*)?$";
    private static final Pattern PATTERN = Pattern.compile(SQLSERVER_URL_REGEX);


    @Override
    public DataBaseEnum getType() {
        return DataBaseEnum.SQLServer;
    }

    @Override
    public String buildUrl(CommonDatabasePO commonDatabasePO) {
        boolean valid = super.checkParams(commonDatabasePO);
        if (!valid)
            return null;
        String url = commonDatabasePO.getUrl();
        if (url != null && PATTERN.matcher(url).matches())
            return url;
        return String.format("jdbc:sqlserver://%s:%s;database=%s", commonDatabasePO.getIp(), commonDatabasePO.getPort(), commonDatabasePO.getDatabaseName());
    }
}
