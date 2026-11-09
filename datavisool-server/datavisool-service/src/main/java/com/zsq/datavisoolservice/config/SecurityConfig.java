/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.config;

import com.zsq.datavisoolservice.config.security.CustomAccessDeniedHandler;
import com.zsq.datavisoolservice.config.security.CustomAuthenticationEntryPoint;
import com.zsq.datavisoolservice.filter.JwtAuthFilter;
import com.zsq.datavisoolservice.service.impl.JwtRevocationService;
import com.zsq.datavisoolservice.util.JwtUtils;
import com.zsq.datavisoolservice.util.ResponseUtil;
import lombok.extern.log4j.Log4j2;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.dao.DataAccessException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;
import java.nio.charset.StandardCharsets;

@Log4j2
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http,
                                           CorsConfigurationSource corsConfigurationSource,
                                           JwtRevocationService revocationService) throws Exception {
        http
                // 禁用CSRF和Session
                .csrf(AbstractHttpConfigurer::disable)
                .cors(cors -> cors.configurationSource(corsConfigurationSource))
                .sessionManagement(session ->
                        session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                // 权限配置
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(SecurityPathConfig.getPermitAllPaths()).permitAll()
                        .requestMatchers(request -> RequestPathClassifier.isFrontendRoutePath(request.getRequestURI())).permitAll()
                        .anyRequest().authenticated())
                .logout(logout -> logout.logoutUrl("/api/authenticate/logout")
                        .logoutSuccessHandler((request, response, authentication) -> {
                            response.setCharacterEncoding(StandardCharsets.UTF_8.name());
                            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
                            String header = request.getHeader("Authorization");
                            if (header != null && header.startsWith("Bearer ")) {
                                String token = header.substring(7);
                                var claims = JwtUtils.parseValidClaims(token);
                                if (claims != null) {
                                    try {
                                        revocationService.revoke(token, claims.getExpiration().getTime());
                                    } catch (DataAccessException e) {
                                        log.error("记录退出令牌失败", e);
                                        response.setStatus(503);
                                        response.getWriter().write(ResponseUtil.responseJson(503, "退出失败，请重试"));
                                        return;
                                    }
                                }
                            }
                            response.getWriter().write(ResponseUtil.responseJson(200, "登出成功"));
                        }))
                // 添加JWT过滤器
                .addFilterBefore(jwtAuthFilter(), UsernamePasswordAuthenticationFilter.class)
                .exceptionHandling(handling ->
                        handling.accessDeniedHandler((request, response, ex) -> {
                            response.setStatus(403);
                            response.getWriter().write(ResponseUtil.responseJson(403, "您没有权限"));
                        })
                )
                // 自定义异常处理
                .exceptionHandling(e -> e
                        .authenticationEntryPoint(authEntryPoint()) //认证异常处理
                        .accessDeniedHandler(accessDeniedHandler()) //授权异常处理
                );
        return http.build();
    }

    @Bean
    public JwtAuthFilter jwtAuthFilter() {
        return new JwtAuthFilter();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource(
            @Value("${datavisool.security.cors.allowed-origin-patterns:}") String allowedOriginPatterns) {
        List<String> originPatterns = SecurityCorsSupport.parseAllowedOriginPatterns(allowedOriginPatterns);
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        CorsConfiguration config = SecurityCorsSupport.buildCorsConfiguration(originPatterns);
        if (config == null) {
            log.info("CORS disabled: same-origin deployment does not require cross-origin access.");
            return source;
        }
        source.registerCorsConfiguration("/api/**", config);
        source.registerCorsConfiguration("/static/**", config);
        log.info("CORS enabled for {} configured origin pattern(s).", originPatterns.size());
        return source;
    }

    @Bean
    public AuthenticationEntryPoint authEntryPoint() {
        return new CustomAuthenticationEntryPoint();
    }

    @Bean
    public AccessDeniedHandler accessDeniedHandler() {
        return new CustomAccessDeniedHandler();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();  // 使用BCrypt加密
    }

    @Bean
    public AuthenticationManager authenticationManager(
            AuthenticationConfiguration config) throws Exception {
        return config.getAuthenticationManager();
    }


}
