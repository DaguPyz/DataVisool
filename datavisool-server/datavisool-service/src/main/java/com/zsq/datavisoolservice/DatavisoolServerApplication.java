/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice;

import com.zsq.datavisoolservice.core.migration.DatabaseCheck;
import com.zsq.datavisoolservice.config.ServerPortCheck;
import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.EnableAspectJAutoProxy;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.transaction.annotation.EnableTransactionManagement;

@SpringBootApplication(scanBasePackages = {"com.zsq.datavisoolservice"})
@MapperScan("com.zsq.datavisoolservice.mapper")
@EnableTransactionManagement
@EnableAspectJAutoProxy
@EnableScheduling
@EnableMethodSecurity
public class DatavisoolServerApplication {

    public static void main(String[] args) {
        SpringApplication application = new SpringApplication(DatavisoolServerApplication.class);
        // Config files, profiles and environment placeholders are resolved before this initializer.
        application.addInitializers(context -> {
            ServerPortCheck.verify(context.getEnvironment());
            DatabaseCheck.dbCheck(context.getEnvironment());
        });
        application.run(args);
    }

}
