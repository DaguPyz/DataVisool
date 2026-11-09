/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.executor;

import com.zsq.datavisoolservice.model.po.CommonDatabasePO;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class OracleUrlBuilderTest {
    private final OracleUrlBuilder builder = new OracleUrlBuilder();

    @Test
    void generatesServiceNameUrlWhenUrlIsEmpty() {
        CommonDatabasePO database = database();
        database.setUrl("");

        assertEquals("jdbc:oracle:thin:@//localhost:1521/FREEPDB1", builder.buildUrl(database));
        database.setUrl(null);
        assertEquals("jdbc:oracle:thin:@//localhost:1521/FREEPDB1", builder.buildUrl(database));
    }

    @Test
    void preservesExplicitServiceNameAndSidUrls() {
        CommonDatabasePO database = database();
        database.setUrl("jdbc:oracle:thin:@//localhost:1521/FREEPDB1");
        assertEquals(database.getUrl(), builder.buildUrl(database));

        database.setUrl("jdbc:oracle:thin:@localhost:1521:ORCL");
        assertEquals(database.getUrl(), builder.buildUrl(database));
    }

    private CommonDatabasePO database() {
        CommonDatabasePO database = new CommonDatabasePO();
        database.setIp("localhost");
        database.setPort("1521");
        database.setDatabaseName("FREEPDB1");
        return database;
    }
}
