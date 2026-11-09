/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Data
@Component
@ConfigurationProperties(prefix = "datavisool.web-update")
public class WebUpdateProperties {

    /** 是否启用 Web 端更新检测；需要配置可用的更新接口。 */
    private boolean enabled = false;

    /** 官方最新版本接口地址；可使用 {currentVersion} 占位符。 */
    private String officialApiUrl = "";

    /** 官方接口请求方式，仅支持 GET 或 POST。 */
    private String officialApiMethod = "GET";

    /** 最新版本号在官方 JSON 响应中的字段路径，例如 data.version。 */
    private String versionJsonPath = "data.version";

    /** 调用官方接口的超时时间（秒）。 */
    private int timeoutSeconds = 5;

    /** 售后二维码图片地址；未配置时使用 Web 内置二维码。 */
    private String supportQrCodeUrl;
}
