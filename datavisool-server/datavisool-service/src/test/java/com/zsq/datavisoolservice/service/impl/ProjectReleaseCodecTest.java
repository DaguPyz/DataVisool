/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl;

import com.alibaba.fastjson.JSON;
import com.zsq.datavisoolservice.mapper.ProjectReleaseRuntimeCommonApiMapper;
import com.zsq.datavisoolservice.mapper.ProjectReleaseRuntimeDatasourceMapper;
import com.zsq.datavisoolservice.util.ProjectDataCodecUtil;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class ProjectReleaseCodecTest {
    @Test void releaseProcessingPreservesCurrentCompression() {
        ProjectReleaseServiceImpl service = new ProjectReleaseServiceImpl();
        ReflectionTestUtils.setField(service, "runtimeDatasourceMapper", mock(ProjectReleaseRuntimeDatasourceMapper.class));
        ReflectionTestUtils.setField(service, "runtimeCommonApiMapper", mock(ProjectReleaseRuntimeCommonApiMapper.class));
        String json = "{\"name\":\"synthetic\",\"values\":[\"alpha\",\"beta\"]}";
        String current = ProjectDataCodecUtil.encode(json);
        for (String input : new String[]{current}) {
            String output = ReflectionTestUtils.invokeMethod(service, "prepareReleaseRuntimeResources", 42L, 7L, input);
            assertNotNull(output);
            assertTrue(output.startsWith("DVZ1:gzip:"));
            assertEquals(JSON.parseObject(json), JSON.parseObject(ProjectDataCodecUtil.decode(output)));
        }
        String plain = ReflectionTestUtils.invokeMethod(service, "prepareReleaseRuntimeResources", 42L, 7L, json);
        assertNotNull(plain);
        assertFalse(ProjectDataCodecUtil.isCompressed(plain));
        assertEquals(JSON.parseObject(json), JSON.parseObject(plain));
    }
}
