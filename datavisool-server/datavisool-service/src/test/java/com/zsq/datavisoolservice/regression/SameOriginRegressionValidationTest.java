/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.regression;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.zsq.datavisoolservice.config.AppBaseConfig;
import com.zsq.datavisoolservice.config.FrontendRouteConfig;
import com.zsq.datavisoolservice.config.SecurityConfig;
import com.zsq.datavisoolservice.config.StaticSourceInterceptor;
import com.zsq.datavisoolservice.controller.AuthenticateController;
import com.zsq.datavisoolservice.controller.FrontendController;
import com.zsq.datavisoolservice.controller.ImageController;
import com.zsq.datavisoolservice.controller.ImportController;
import com.zsq.datavisoolservice.controller.ProjectController;
import com.zsq.datavisoolservice.controller.ProjectReleaseController;
import com.zsq.datavisoolservice.global.GlobalExceptionHandler;
import com.zsq.datavisoolservice.model.auth.User;
import com.zsq.datavisoolservice.model.dto.EncryptResultDTO;
import com.zsq.datavisoolservice.model.dto.LoginInfoDTO;
import com.zsq.datavisoolservice.model.dto.ProjectDTO;
import com.zsq.datavisoolservice.model.dto.ProjectReleaseDTO;
import com.zsq.datavisoolservice.security.HybridCryptoUtil;
import com.zsq.datavisoolservice.security.RsaKeyPair;
import com.zsq.datavisoolservice.service.ImageService;
import com.zsq.datavisoolservice.service.ProjectReleaseService;
import com.zsq.datavisoolservice.service.ProjectService;
import com.zsq.datavisoolservice.service.impl.AuthService;
import com.zsq.datavisoolservice.util.JwtUtils;
import org.junit.AfterClass;
import org.junit.Assert;
import org.junit.BeforeClass;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.test.context.junit4.SpringRunner;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyPair;
import java.util.Base64;
import java.util.Map;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.forwardedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@RunWith(SpringRunner.class)
@SpringBootTest(
        classes = SameOriginRegressionValidationTest.TestApplication.class,
        webEnvironment = SpringBootTest.WebEnvironment.MOCK,
        properties = {
                "datavisool.mode=TEST",
                "spring.datasource.druid.password=synthetic-test-password",
                "datavisool.resource-path.root=target/test-runtime-resources"
        }
)
@AutoConfigureMockMvc
public class SameOriginRegressionValidationTest {

    private static final Path TEST_RESOURCE_ROOT = Path.of("target/test-runtime-resources");

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockBean
    private AuthService authService;

    @MockBean
    private ProjectService projectService;

    @MockBean
    private ProjectReleaseService projectReleaseService;

    @MockBean
    private ImageService imageService;

    @MockBean
    private UserDetailsService userDetailsService;

    @MockBean
    private com.zsq.datavisoolservice.service.impl.JwtRevocationService revocationService;

    @Test
    public void revokedTokenStorageFailureMustNotAuthenticateOrReportLogoutSuccess() throws Exception {
        User user = new User();
        user.setUsername("revocation-storage-test");
        String token = JwtUtils.generateToken(user);
        Mockito.when(revocationService.isRevoked(token))
                .thenThrow(new org.springframework.dao.DataAccessResourceFailureException("test"));
        mockMvc.perform(get("/api/project/getProjectData/1").header("Authorization", "Bearer " + token))
                .andExpect(status().isServiceUnavailable());
        Mockito.verify(userDetailsService, Mockito.never()).loadUserByUsername(user.getUsername());

        Mockito.doThrow(new org.springframework.dao.DataAccessResourceFailureException("test"))
                .when(revocationService).revoke(Mockito.eq(token), Mockito.anyLong());
        mockMvc.perform(post("/api/authenticate/logout").header("Authorization", "Bearer " + token))
                .andExpect(status().isServiceUnavailable()).andExpect(jsonPath("$.code").value(503));
    }

    @BeforeClass
    public static void setUp() throws Exception {
        Files.createDirectories(TEST_RESOURCE_ROOT.resolve("static/images"));
        Files.writeString(TEST_RESOURCE_ROOT.resolve("static/images/smoke.txt"), "smoke-image", StandardCharsets.UTF_8);

        AppBaseConfig.SYSTEM_RSA_KEY_PAIR = createRsaKeyPair();
    }

    @AfterClass
    public static void tearDown() throws Exception {
        Files.deleteIfExists(TEST_RESOURCE_ROOT.resolve("static/images/smoke.txt"));
        Files.deleteIfExists(TEST_RESOURCE_ROOT.resolve("static/images"));
        Files.deleteIfExists(TEST_RESOURCE_ROOT.resolve("static"));
        Files.deleteIfExists(TEST_RESOURCE_ROOT);
    }

    @Test
    public void frontendShellAndAssetsShouldBeServedByServer() throws Exception {
        mockMvc.perform(get("/"))
                .andExpect(status().isOk())
                .andExpect(forwardedUrl("/index.html"));

        mockMvc.perform(get("/index.html"))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.TEXT_HTML))
                .andExpect(content().string(org.hamcrest.Matchers.containsString("Regression Shell")));

        mockMvc.perform(get("/assets/app.js"))
                .andExpect(status().isOk())
                .andExpect(content().string(org.hamcrest.Matchers.containsString("__REGRESSION_ASSET__")));

        mockMvc.perform(get("/favicon.ico"))
                .andExpect(status().isOk())
                .andExpect(content().string(org.hamcrest.Matchers.containsString("test-favicon")));
    }

    @Test
    public void browserRouterDeepLinksShouldFallbackToIndexHtml() throws Exception {
        mockMvc.perform(get("/home/console"))
                .andExpect(status().isOk())
                .andExpect(forwardedUrl("/index.html"));

        mockMvc.perform(get("/designer"))
                .andExpect(status().isOk())
                .andExpect(forwardedUrl("/index.html"));

        mockMvc.perform(get("/release/123"))
                .andExpect(status().isOk())
                .andExpect(forwardedUrl("/index.html"));
    }

    @Test
    public void projectAndReleaseEndpointsShouldReturnJsonInsteadOfFrontendFallback() throws Exception {
        ProjectDTO projectDTO = new ProjectDTO();
        projectDTO.setId(1L);
        projectDTO.setName("demo-project");
        Mockito.when(projectService.getProjectData(1L)).thenReturn(projectDTO);

        ProjectReleaseDTO releaseDTO = new ProjectReleaseDTO();
        releaseDTO.setId(1L);
        releaseDTO.setName("demo-release");
        Mockito.when(projectReleaseService.getProjectReleaseInfo(1L)).thenReturn(releaseDTO);

        mockMvc.perform(get("/api/project/getProjectData/1"))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.code").value(10002));

        User user = new User();
        user.setUsername("regression-user");
        user.setRoles(java.util.List.of("ROLE_USER"));
        user.setPermissions(java.util.List.of());
        Mockito.when(userDetailsService.loadUserByUsername(user.getUsername())).thenReturn(user);
        String token = JwtUtils.generateToken(user);

        mockMvc.perform(get("/api/project/getProjectData/1").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.id").value("1"))
                .andExpect(jsonPath("$.data.name").value("demo-project"));

        mockMvc.perform(get("/api/release/getReleaseInfo/1"))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.id").value("1"))
                .andExpect(jsonPath("$.data.name").value("demo-release"));
    }

    @Test
    public void importingProjectsRequiresAuthentication() throws Exception {
        MockMultipartFile file = new MockMultipartFile("file", "synthetic.zip", "application/zip", new byte[]{1});
        mockMvc.perform(multipart("/api/import/importProject").file(file).param("projectId", "1"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.code").value(10002));
        Mockito.verify(projectService, Mockito.never()).importProject(Mockito.any());

        User user = new User(); user.setUsername("import-regression-user");
        user.setRoles(java.util.List.of("ROLE_USER")); user.setPermissions(java.util.List.of());
        Mockito.when(userDetailsService.loadUserByUsername(user.getUsername())).thenReturn(user);
        Mockito.when(projectService.importProject(Mockito.any())).thenReturn(true);
        String token = JwtUtils.generateToken(user);
        mockMvc.perform(multipart("/api/import/importProject").file(file).param("projectId", "1")
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk()).andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data").value(true));
        Mockito.verify(projectService).importProject(Mockito.any());
    }

    @Test
    public void loginApiShouldAcceptEncryptedPayloadAndReturnJson() throws Exception {
        Mockito.when(authService.authenticate("tester", "secret"))
                .thenReturn(new LoginInfoDTO(1L, "Tester", "tester", "/static/avatar/a.png", "token-123", java.util.List.of("ROLE_SYSTEM_ADMIN")));

        EncryptResultDTO encryptedPassword = HybridCryptoUtil.encrypt("secret");
        String requestBody = objectMapper.writeValueAsString(Map.of(
                "username", "tester",
                "password", encryptedPassword
        ));

        mockMvc.perform(post("/api/authenticate/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(requestBody))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.username").value("tester"))
                .andExpect(jsonPath("$.data.token").value("token-123"));
    }

    @Test
    public void protectedApiWithoutTokenShouldReturnJsonAuthResponseNotFrontendHtml() throws Exception {
        MvcResult result = mockMvc.perform(get("/api/image/getUserUploadedImageList"))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andReturn();

        String responseBody = result.getResponse().getContentAsString(StandardCharsets.UTF_8);
        Assert.assertTrue(responseBody.contains("\"code\""));
        Assert.assertFalse(responseBody.contains("Regression Shell"));
    }

    @Test
    public void uploadedStaticResourceShouldBeAccessibleAndMissingResourceShouldStay404() throws Exception {
        mockMvc.perform(get("/static/images/smoke.txt"))
                .andExpect(status().isOk())
                .andExpect(content().string("smoke-image"));

        mockMvc.perform(get("/static/images/missing.txt"))
                .andExpect(status().isNotFound())
                .andExpect(content().string(""));
    }

    private static RsaKeyPair createRsaKeyPair() throws Exception {
        KeyPair keyPair = HybridCryptoUtil.generateRsaKeyPair();
        RsaKeyPair rsaKeyPair = new RsaKeyPair();
        rsaKeyPair.setKeyPair(keyPair);
        rsaKeyPair.setGenerateTime(System.currentTimeMillis());
        rsaKeyPair.setPublicKey(Base64.getEncoder().encodeToString(keyPair.getPublic().getEncoded()));
        rsaKeyPair.setPrivateKey(Base64.getEncoder().encodeToString(keyPair.getPrivate().getEncoded()));
        return rsaKeyPair;
    }

    @SpringBootApplication
    @EnableMethodSecurity
    @Import({
            AppBaseConfig.class,
            StaticSourceInterceptor.class,
            FrontendRouteConfig.class,
            FrontendController.class,
            SecurityConfig.class,
            GlobalExceptionHandler.class,
            AuthenticateController.class,
            ProjectController.class,
            ProjectReleaseController.class,
            ImageController.class,
            ImportController.class
    })
    public static class TestApplication {
    }
}
