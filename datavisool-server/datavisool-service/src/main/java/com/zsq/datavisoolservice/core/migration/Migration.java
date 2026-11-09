/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

package com.zsq.datavisoolservice.core.migration;

import lombok.Data;
import org.apache.commons.lang3.StringUtils;
import org.springframework.core.io.Resource;

import java.util.Arrays;
import java.util.Date;
import java.util.Objects;

@Data
public class Migration implements Comparable<Migration> {

    private String id;

    private String version;

    private String fileName;

    private String executeUser;

    private Date executeDate;

    private boolean success;

    private Resource upgradeFile;

    private Resource rollbackFile;

    private final static String SPLIT = "__";

    private final static String FILE_SUFFIX = ".sql";

    public Migration() {

    }

    public Migration(Resource upgradeFile, Resource rollbackFile) {
        String fileName = upgradeFile.getFilename();
        String[] extractName = extractName(Objects.requireNonNull(upgradeFile.getFilename()));
        setId(extractName[0]);
        this.setVersion(extractName[1]);
        this.fileName = fileName;
        this.upgradeFile = upgradeFile;
        this.rollbackFile = rollbackFile;
    }

    @Override
    public int compareTo(Migration other) {
        int[] otherId = Arrays.stream(other.getId().split("\\.")).mapToInt(Integer::valueOf).toArray();
        int[] thisId = Arrays.stream(id.split("\\.")).mapToInt(Integer::valueOf).toArray();
        if (otherId.length != thisId.length) {
            return thisId.length - otherId.length;
        }
        for (int i = 0; i < thisId.length; i++) {
            if (thisId[i] != otherId[i]) {
                return thisId[i] - otherId[i];
            }
        }
        return 0;
    }

    private String[] extractName(String fileName) {
        String[] split = fileName.split(Migration.SPLIT);
        return new String[]{split[0].substring(1), split[1].replace(FILE_SUFFIX, "")};
    }

    public static boolean isMigrationFile(Resource resource) {
        if (resource == null)
            return false;
        String name = resource.getFilename();
        if (!StringUtils.endsWithIgnoreCase(name, FILE_SUFFIX))
            return false;
        if (Objects.requireNonNull(name).split(SPLIT).length != 2)
            return false;
        return name.startsWith(ScriptType.ROLLBACK.getPrefix()) || name.startsWith(ScriptType.UPGRADE.getPrefix());
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof Migration migration)) return false;
        return id.equals(migration.id);
    }

    @Override
    public int hashCode() {
        return Objects.hash(id);
    }
}