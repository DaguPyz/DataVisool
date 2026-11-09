/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.util;


import com.zsq.datavisoolcommon.model.dto.ProjectDependencyItemDTO;

import java.util.List;

/**
 * Map工具类
 */
public class ProjectUtil {
    /**
     * 用于在导入项目时，根据文件hash值获取对应的文件名称
     * 根据传入value模糊匹配map中的value，获取第一个匹配的value对应的key
     *
     * @param depItemList 依赖项List
     * @param value       键
     * @return 键
     */
    public static String getDepFileName(List<ProjectDependencyItemDTO> depItemList, String value) {
        if (depItemList == null || depItemList.isEmpty() || value == null)
            return null;
        for (ProjectDependencyItemDTO depItem : depItemList) {
            if (depItem.getValue().contains(value))
                return depItem.getName();
        }
        return null;
    }

    /**
     * 在发布时构建大屏组件的占位符，便于后端直接替换。
     * 该方法的占位符生成逻辑必须与前端一致。
     *
     * @param screenId 原始大屏 ID
     * @return 占位符字符串，例如 "__SCREEN_123__"，如果 screenId 为空则返回 null
     */
    public static String buildScreenIdPlaceholder(String screenId) {
        if (screenId == null || screenId.isEmpty()) {
            System.out.println("大屏引用为空，无法替换");
            return null;
        }
        return "__SCREEN_" + screenId + "__";
    }


}
