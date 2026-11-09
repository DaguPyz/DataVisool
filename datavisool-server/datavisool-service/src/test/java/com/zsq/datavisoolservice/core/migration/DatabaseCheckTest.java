/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.core.migration;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.WebApplicationType;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.core.env.SystemEnvironmentPropertySource;
import org.springframework.mock.env.MockEnvironment;

import java.lang.reflect.Proxy;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.Driver;
import java.sql.DriverManager;
import java.sql.DriverPropertyInfo;
import java.util.Map;
import java.util.Properties;
import java.util.logging.Logger;

import static org.junit.jupiter.api.Assertions.*;

class DatabaseCheckTest {
    @TempDir Path temporary;

    @Configuration(proxyBeanMethods = false)
    static class EmptyApplication {}

    @Test
    void externalConfigEnvironmentAndProfileAreResolvedBeforeDatabasePreflight() throws Exception {
        Path directory = Files.createDirectories(temporary.resolve("配置 with spaces"));
        Path config = directory.resolve("application.yml");
        Files.writeString(config, """
                spring:
                  datasource:
                    druid:
                      url: jdbc:lcp-test://${DB_HOST}:${DB_PORT:3306}/docker_test
                      username: unused-base-user
                      password: ${DB_PASSWORD}
                """);
        Files.writeString(directory.resolve("application-prod.yml"), """
                spring:
                  datasource:
                    druid:
                      username: ${DB_USER}
                """);
        String password = "literal$money # space'quote";
        StandardEnvironment environment = new StandardEnvironment();
        environment.getPropertySources().replace(StandardEnvironment.SYSTEM_ENVIRONMENT_PROPERTY_SOURCE_NAME,
                new SystemEnvironmentPropertySource(StandardEnvironment.SYSTEM_ENVIRONMENT_PROPERTY_SOURCE_NAME, Map.of(
                        "SPRING_CONFIG_LOCATION", config.toUri().toString(),
                        "SPRING_PROFILES_ACTIVE", "prod",
                        "DB_HOST", "host.docker.internal", "DB_USER", "host_user", "DB_PASSWORD", password)));
        SpringApplication application = new SpringApplication(EmptyApplication.class);
        application.setEnvironment(environment);
        application.setWebApplicationType(WebApplicationType.NONE);
        application.setRegisterShutdownHook(false);
        application.setLogStartupInfo(false);
        application.addInitializers(context -> DatabaseCheck.dbCheck(context.getEnvironment()));
        try (RecordingDriver driver = new RecordingDriver(); var context = application.run("--DB_PORT=13306")) {
            assertEquals("jdbc:lcp-test://host.docker.internal:13306/docker_test", driver.url);
            assertEquals("host_user", driver.credentials.getProperty("user"));
            assertEquals(password, driver.credentials.getProperty("password"));
        }
    }

    @Test
    void standardDatasourcePropertiesRemainSupported() throws Exception {
        MockEnvironment environment = new MockEnvironment()
                .withProperty("spring.datasource.url", "jdbc:lcp-test://localhost/existing")
                .withProperty("spring.datasource.username", "local_user")
                .withProperty("spring.datasource.password", "");
        try (RecordingDriver driver = new RecordingDriver()) {
            DatabaseCheck.dbCheck(environment);
            assertEquals("jdbc:lcp-test://localhost/existing", driver.url);
            assertEquals("local_user", driver.credentials.getProperty("user"));
            assertEquals("", driver.credentials.getProperty("password"));
        }
    }

    @Test
    void missingCredentialsFailBeforeOpeningAConnection() throws Exception {
        MockEnvironment environment = new MockEnvironment()
                .withProperty("spring.datasource.druid.url", "jdbc:lcp-test://localhost/existing")
                .withProperty("spring.datasource.druid.username", "local_user");
        try (RecordingDriver driver = new RecordingDriver()) {
            assertThrows(IllegalStateException.class, () -> DatabaseCheck.dbCheck(environment));
            assertNull(driver.url);
        }
    }

    /** Only accepts a test protocol, so these tests cannot reach a real database. */
    static class RecordingDriver implements Driver, AutoCloseable {
        String url;
        Properties credentials;
        RecordingDriver() throws Exception { DriverManager.registerDriver(this); }
        @Override public Connection connect(String url, Properties info) {
            if (!acceptsURL(url)) return null;
            this.url = url;
            this.credentials = info;
            return (Connection) Proxy.newProxyInstance(getClass().getClassLoader(), new Class<?>[]{Connection.class},
                    (proxy, method, args) -> null);
        }
        @Override public boolean acceptsURL(String url) { return url.startsWith("jdbc:lcp-test:"); }
        @Override public DriverPropertyInfo[] getPropertyInfo(String url, Properties info) { return new DriverPropertyInfo[0]; }
        @Override public int getMajorVersion() { return 1; }
        @Override public int getMinorVersion() { return 0; }
        @Override public boolean jdbcCompliant() { return false; }
        @Override public Logger getParentLogger() { return Logger.getGlobal(); }
        @Override public void close() throws Exception { DriverManager.deregisterDriver(this); }
    }
}
