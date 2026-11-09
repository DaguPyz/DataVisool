/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai;

import com.zsq.datavisoolservice.service.impl.ai.provider.AiModelProviderStrategy;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;

/** 仅加载模型策略，按生产环境相同的组件扫描与构造器注入路径装配。 */
@Configuration(proxyBeanMethods = false)
@ComponentScan(basePackageClasses = AiModelProviderStrategy.class)
@Import(LangChain4jModelProviderFactory.class)
class AiProviderTestConfiguration { }
