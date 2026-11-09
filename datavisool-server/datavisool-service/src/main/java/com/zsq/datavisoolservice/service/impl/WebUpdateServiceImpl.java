/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.zsq.datavisoolservice.config.WebUpdateProperties;
import com.zsq.datavisoolservice.global.AppException;
import com.zsq.datavisoolservice.global.AppStatusCode;
import com.zsq.datavisoolservice.mapper.WebUpdateSkipMapper;
import com.zsq.datavisoolservice.model.auth.User;
import com.zsq.datavisoolservice.model.dto.WebUpdateCheckDTO;
import com.zsq.datavisoolservice.model.po.WebUpdateSkipPO;
import com.zsq.datavisoolservice.service.WebUpdateService;
import com.zsq.datavisoolservice.util.AppContextUtil;
import com.zsq.datavisoolservice.util.VersionComparator;
import lombok.RequiredArgsConstructor;
import lombok.extern.log4j.Log4j2;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Optional;

@Log4j2
@Service
@RequiredArgsConstructor
public class WebUpdateServiceImpl implements WebUpdateService {
    private static final String PRODUCT_CODE = "DATAVISOOL-WEB";
    private static final HttpClient HTTP_CLIENT = HttpClient.newBuilder()
            .followRedirects(HttpClient.Redirect.NORMAL)
            .build();

    private final WebUpdateProperties properties;
    private final WebUpdateSkipMapper webUpdateSkipMapper;
    private final ObjectMapper objectMapper;

    @Override
    public WebUpdateCheckDTO check(String currentVersion, boolean includeSkipped) {
        String normalizedCurrentVersion = VersionComparator.normalize(currentVersion);
        if (!properties.isEnabled() || !StringUtils.hasText(properties.getOfficialApiUrl())) {
            return WebUpdateCheckDTO.noUpdate(false);
        }
        if (normalizedCurrentVersion == null) {
            return WebUpdateCheckDTO.noUpdate(true);
        }

        Optional<String> latestVersion = fetchLatestVersion(normalizedCurrentVersion);
        if (latestVersion.isEmpty()) {
            return WebUpdateCheckDTO.noUpdate(true);
        }
        boolean needUpgrade = VersionComparator.compare(latestVersion.get(), normalizedCurrentVersion) > 0
                && (includeSkipped || !isSkipped(latestVersion.get()));
        return new WebUpdateCheckDTO(needUpgrade, latestVersion.get(), properties.getSupportQrCodeUrl(), true);
    }

    @Override
    public boolean skip(String latestVersion) {
        String normalizedVersion = VersionComparator.normalize(latestVersion);
        if (normalizedVersion == null) {
            throw new AppException(AppStatusCode.INVALID_PARAM, "最新版本号格式无效");
        }
        if (isSkipped(normalizedVersion)) {
            return true;
        }

        User currentUser = AppContextUtil.getCurrentUser();
        WebUpdateSkipPO skipRecord = new WebUpdateSkipPO();
        skipRecord.setProductCode(PRODUCT_CODE);
        skipRecord.setSkippedVersion(normalizedVersion);
        skipRecord.setSkippedBy(currentUser.getId());
        skipRecord.setSkippedAt(LocalDateTime.now());
        try {
            return webUpdateSkipMapper.insert(skipRecord) > 0;
        } catch (DuplicateKeyException exception) {
            return true;
        }
    }

    private boolean isSkipped(String latestVersion) {
        Long count = webUpdateSkipMapper.selectCount(new LambdaQueryWrapper<WebUpdateSkipPO>()
                .eq(WebUpdateSkipPO::getProductCode, PRODUCT_CODE)
                .eq(WebUpdateSkipPO::getSkippedVersion, latestVersion));
        return count != null && count > 0;
    }

    private Optional<String> fetchLatestVersion(String currentVersion) {
        if (!StringUtils.hasText(properties.getOfficialApiUrl())) {
            return Optional.empty();
        }
        try {
            URI uri = URI.create(properties.getOfficialApiUrl().replace(
                    "{currentVersion}", URLEncoder.encode(currentVersion, StandardCharsets.UTF_8)));
            int timeoutSeconds = Math.max(1, properties.getTimeoutSeconds());
            HttpRequest.Builder requestBuilder = HttpRequest.newBuilder(uri)
                    .timeout(Duration.ofSeconds(timeoutSeconds))
                    .header("Accept", "application/json");
            if ("POST".equalsIgnoreCase(properties.getOfficialApiMethod())) {
                requestBuilder.POST(HttpRequest.BodyPublishers.noBody());
            } else {
                requestBuilder.GET();
            }

            HttpResponse<String> response = HTTP_CLIENT.send(
                    requestBuilder.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                log.warn("Web 更新检测官方接口返回异常状态：{}", response.statusCode());
                return Optional.empty();
            }
            String version = readVersion(response.body());
            return Optional.ofNullable(VersionComparator.normalize(version));
        } catch (Exception exception) {
            log.warn("Web 更新检测调用官方接口失败", exception);
            return Optional.empty();
        }
    }

    String readVersion(String responseBody) throws Exception {
        JsonNode root;
        try {
            root = objectMapper.readTree(responseBody);
        } catch (Exception ignored) {
            return responseBody == null ? null : responseBody.trim();
        }
        if (root == null) {
            return null;
        }
        if (root.isValueNode()) {
            return root.asText();
        }
        if (root.has("code") && root.path("code").asInt(-1) != 200) {
            log.warn("Web 更新检测官方接口返回失败：code={}", root.path("code").asText());
            return null;
        }
        String path = properties.getVersionJsonPath();
        if (!StringUtils.hasText(path)) {
            return null;
        }
        JsonNode current = root;
        for (String field : path.split("\\.")) {
            if (!StringUtils.hasText(field)) {
                continue;
            }
            current = current.path(field);
            if (current.isMissingNode() || current.isNull()) {
                return null;
            }
        }
        return current.isValueNode() ? current.asText() : null;
    }
}
