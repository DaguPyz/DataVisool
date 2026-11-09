/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.model.dto;

import lombok.Data;

import java.io.Serializable;

@Data
public class ConsoleRecentActivityDTO implements Serializable {
    private String id;
    private String type;
    private String name;
    private Long timeMs;
}
