/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.config;

import org.junit.Assert;
import org.junit.Test;

public class RequestPathClassifierTest {

    @Test
    public void classifySeparatesFrontendApiAndRuntimeStaticPaths() {
        Assert.assertEquals(RequestPathClassifier.PathCategory.FRONTEND_ENTRY_PAGE,
                RequestPathClassifier.classify("/"));
        Assert.assertEquals(RequestPathClassifier.PathCategory.FRONTEND_ENTRY_PAGE,
                RequestPathClassifier.classify("/index.html"));
        Assert.assertEquals(RequestPathClassifier.PathCategory.FRONTEND_BUILD_ASSET,
                RequestPathClassifier.classify("/assets/index.js"));
        Assert.assertEquals(RequestPathClassifier.PathCategory.FRONTEND_BUILD_ASSET,
                RequestPathClassifier.classify("/favicon.ico"));
        Assert.assertEquals(RequestPathClassifier.PathCategory.API,
                RequestPathClassifier.classify("/api/authenticate/login"));
        Assert.assertEquals(RequestPathClassifier.PathCategory.BUSINESS_STATIC,
                RequestPathClassifier.classify("/static/images/demo.png"));
        Assert.assertEquals(RequestPathClassifier.PathCategory.FRONTEND_ROUTE,
                RequestPathClassifier.classify("/home/console"));
        Assert.assertEquals(RequestPathClassifier.PathCategory.FRONTEND_ROUTE,
                RequestPathClassifier.classify("/release/123"));
        Assert.assertEquals(RequestPathClassifier.PathCategory.BACKEND_INTERNAL,
                RequestPathClassifier.classify("/actuator/health"));
        Assert.assertEquals(RequestPathClassifier.PathCategory.FILE_REQUEST,
                RequestPathClassifier.classify("/manifest.webmanifest"));
    }

    @Test
    public void classifyDoesNotOverMatchReservedPrefixes() {
        Assert.assertEquals(RequestPathClassifier.PathCategory.FRONTEND_ROUTE,
                RequestPathClassifier.classify("/apiary/home"));
        Assert.assertEquals(RequestPathClassifier.PathCategory.FRONTEND_ROUTE,
                RequestPathClassifier.classify("/staticx/demo"));
        Assert.assertEquals(RequestPathClassifier.PathCategory.FRONTEND_ROUTE,
                RequestPathClassifier.classify("/assetsCenter/list"));
    }

    @Test
    public void staticResourceDetectionOnlyMatchesBuildAndBusinessAssets() {
        Assert.assertTrue(RequestPathClassifier.isStaticResourceRequestPath("/index.html"));
        Assert.assertTrue(RequestPathClassifier.isStaticResourceRequestPath("/favicon.ico"));
        Assert.assertTrue(RequestPathClassifier.isStaticResourceRequestPath("/assets/app.js"));
        Assert.assertTrue(RequestPathClassifier.isStaticResourceRequestPath("/static/videos/demo.mp4"));
        Assert.assertFalse(RequestPathClassifier.isStaticResourceRequestPath("/home/console"));
        Assert.assertFalse(RequestPathClassifier.isStaticResourceRequestPath("/api/project/pageList"));
    }

    @Test
    public void releaseRuntimeCommonApiEndpointIsPublic() {
        Assert.assertTrue(SecurityPathConfig.isPermitAllPath("/api/release/getCommonApi"));
        Assert.assertTrue(SecurityPathConfig.isPermitAllPath("/api/release/executeDatabase"));
        Assert.assertFalse(SecurityPathConfig.isPermitAllPath("/api/commonApi/getCommonApi/3"));
        Assert.assertFalse(SecurityPathConfig.isPermitAllPath("/api/db/executor/execute"));
    }
}
