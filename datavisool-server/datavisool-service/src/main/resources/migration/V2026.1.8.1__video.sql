-- Licensed under the DataVisool License. See the LICENSE file distributed with this software.
/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

CREATE TABLE IF NOT EXISTS `video` (
    `id` bigint(20) NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    `name` varchar(255) NOT NULL COMMENT '视频名称',
    `url` varchar(500) NOT NULL COMMENT '视频访问路径',
    `size` bigint(20) DEFAULT NULL COMMENT '视频大小(字节)',
    `type` varchar(100) DEFAULT NULL COMMENT '视频类型(MIME)',
    `user_id` bigint(20) NOT NULL COMMENT '上传用户ID',
    `create_time` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    `deleted` tinyint(1) DEFAULT 0 COMMENT '逻辑删除 0:未删除 1:已删除',
    PRIMARY KEY (`id`),
    KEY `idx_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='视频资源表';
