/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.model.dto;

import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class WebUpdateCheckDTO {
    private boolean needUpgrade;
    /** 成功查询官方接口时返回版本号；未完成检查时为 null。 */
    private String latestVersion;
    private String supportQrCodeUrl;
    /** 更新检测是否已启用且配置了接口地址。 */
    private boolean available;

    public static WebUpdateCheckDTO noUpdate(boolean available) {
        return new WebUpdateCheckDTO(false, null, null, available);
    }
}
