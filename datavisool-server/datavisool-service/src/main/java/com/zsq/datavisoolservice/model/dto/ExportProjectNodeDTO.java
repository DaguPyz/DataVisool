/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.model.dto;

import lombok.Data;

import java.io.Serializable;
import java.util.List;

@Data
public class ExportProjectNodeDTO implements Serializable {
    private String sourceProjectId;
    private String name;
    private String sourcePid;
    private Boolean isEntry;
    private List<String> fonts;
    private List<String> images;
    private List<String> videos;
    private List<String> models;
    private List<String> components;
    private List<String> commonApiIds;
    private List<String> databaseIds;
    private String projectJson;
}
