/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl;

import com.zsq.datavisoolservice.global.AppException;
import com.zsq.datavisoolservice.model.po.ProjectReleaseRuntimeDatasourcePO;
import org.junit.Assert;
import org.junit.Test;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class ProjectReleaseServiceImplSqlVariableTest {

    @Test
    public void buildPreparedSqlInlinesIdentifierVariableInFromClause() throws Exception {
        Object preparedSql = buildPreparedSql("select * from #{tableName} where name = #{name}", Map.of(
                "tableName", "user",
                "name", "admin"
        ));

        Assert.assertEquals("select * from user where name = ?", invoke(preparedSql, "sql"));
        Assert.assertEquals(List.of("admin"), invoke(preparedSql, "args"));
    }

    @Test
    public void buildPreparedSqlRejectsUnsafeIdentifierVariable() throws Exception {
        try {
            buildPreparedSql("select * from #{tableName}", Map.of("tableName", "user; drop table user"));
            Assert.fail("Expected AppException");
        } catch (AppException e) {
            Assert.assertTrue(e.getMsg().contains("合法SQL标识符"));
        }
    }

    @Test
    public void buildPreparedSqlKeepsQuotedVariableParameterized() throws Exception {
        Object preparedSql = buildPreparedSql("select * from user where name like '%#{keyword}%'", Map.of("keyword", "adm"));

        Assert.assertEquals("select * from user where name like ?", invoke(preparedSql, "sql"));
        Assert.assertEquals(List.of("%adm%"), invoke(preparedSql, "args"));
    }

    @Test
    public void buildPreparedSqlReplacesMultipleVariablesInOneQuotedLiteral() throws Exception {
        Object preparedSql = buildPreparedSql("select * from user where full_name = '#{first} #{last}' and status = #{status}", Map.of(
                "first", "Alice",
                "last", "Smith",
                "status", 1
        ));

        Assert.assertEquals("select * from user where full_name = ? and status = ?", invoke(preparedSql, "sql"));
        Assert.assertEquals(List.of("Alice Smith", 1), invoke(preparedSql, "args"));
    }

    @Test
    public void buildPreparedSqlUnescapesSqlQuoteContentInQuotedLiteral() throws Exception {
        Object preparedSql = buildPreparedSql("select * from user where note = 'Bob''s #{suffix}'", Map.of("suffix", "book"));

        Assert.assertEquals("select * from user where note = ?", invoke(preparedSql, "sql"));
        Assert.assertEquals(List.of("Bob's book"), invoke(preparedSql, "args"));
    }

    @Test
    public void collectReleaseRuntimeResourcesOnlyCollectsRealCommonApiDataSourceNodes() throws Exception {
        RuntimeResourceResult result = collectRuntimeResources("""
                {
                  "elemConfigs": {
                    "chart_1": {
                      "data": {
                        "sourceType": "static",
                        "staticData": {
                          "value": {
                            "sourceType": "commonApi",
                            "commonApi": {"commonApiId": "11"}
                          }
                        }
                      }
                    },
                    "chart_2": {
                      "data": {
                        "sourceType": "commonApi",
                        "commonApi": {"commonApiId": "21"}
                      },
                      "staticData": {
                        "value": {
                          "data": {
                            "sourceType": "commonApi",
                            "commonApi": {"commonApiId": "12"}
                          }
                        }
                      },
                      "extra": {
                        "sourceType": "commonApi",
                        "commonApi": {"commonApiId": "22"}
                      }
                    }
                  }
                }
                """);

        Map<Long, String> expected = new LinkedHashMap<>();
        expected.put(21L, "$.elemConfigs.chart_2.data.commonApi");
        Assert.assertEquals(expected, result.commonApiRefs);
    }

    @Test
    public void collectReleaseRuntimeResourcesCollectsGlobalVariableTriggerSource() throws Exception {
        RuntimeResourceResult result = collectRuntimeResources("""
                {
                  "globalVariableManager": {
                    "globalVariables": {
                      "gv_1": {
                        "triggerSource": {
                          "sourceType": "commonApi",
                          "commonApi": {"commonApiId": "31"}
                        },
                        "meta": {
                          "triggerSource": {
                            "sourceType": "commonApi",
                            "commonApi": {"commonApiId": "32"}
                          }
                        }
                      }
                    }
                  }
                }
                """);

        Map<Long, String> expected = new LinkedHashMap<>();
        expected.put(31L, "$.globalVariableManager.globalVariables.gv_1.triggerSource.commonApi");
        Assert.assertEquals(expected, result.commonApiRefs);
    }

    @Test
    public void collectReleaseRuntimeResourcesCollectsOnlyGeojsonDataConfigSources() throws Exception {
        RuntimeResourceResult result = collectRuntimeResources("""
                {
                  "elemConfigs": {
                    "map_1": {
                      "style": {
                        "sources": [
                          {
                            "sourceType": "geojson",
                            "dataMode": "dataConfig",
                            "dataConfig": {
                              "sourceType": "commonApi",
                              "commonApi": {"commonApiId": "41"}
                            }
                          },
                          {
                            "sourceType": "geojson",
                            "dataMode": "url",
                            "dataConfig": {
                              "sourceType": "commonApi",
                              "commonApi": {"commonApiId": "42"}
                            }
                          }
                        ]
                      }
                    }
                  }
                }
                """);

        Map<Long, String> expected = new LinkedHashMap<>();
        expected.put(41L, "$.elemConfigs.map_1.style.sources[0].dataConfig.commonApi");
        Assert.assertEquals(expected, result.commonApiRefs);
    }

    @Test
    public void collectReleaseRuntimeResourcesOnlyCollectsRealDatabaseDataSourceNodes() throws Exception {
        RuntimeResourceResult result = collectRuntimeResources("""
                {
                  "elemConfigs": {
                    "chart_1": {
                      "data": {
                        "sourceType": "database",
                        "database": {
                          "targetDb": "51",
                          "sql": "select * from user where name = #{name}"
                        }
                      },
                      "staticData": {
                        "value": {
                          "sourceType": "database",
                          "database": {
                            "targetDb": "52",
                            "sql": "select * from role"
                          }
                        }
                      }
                    }
                  }
                }
                """);

        Assert.assertEquals(1, result.dataSources.size());
        ProjectReleaseRuntimeDatasourcePO dataSource = result.dataSources.get(0);
        Assert.assertEquals(Long.valueOf(51L), dataSource.getTargetDb());
        Assert.assertEquals("$.elemConfigs.chart_1.data.database", dataSource.getSourcePath());
    }

    private Object buildPreparedSql(String sqlTemplate, Map<String, Object> variables) throws Exception {
        Method method = ProjectReleaseServiceImpl.class.getDeclaredMethod("buildPreparedSql", String.class, Map.class);
        method.setAccessible(true);
        try {
            return method.invoke(new ProjectReleaseServiceImpl(), sqlTemplate, variables);
        } catch (InvocationTargetException e) {
            if (e.getCause() instanceof Exception cause)
                throw cause;
            throw e;
        }
    }

    @SuppressWarnings("unchecked")
    private RuntimeResourceResult collectRuntimeResources(String projectJson) throws Exception {
        Method method = ProjectReleaseServiceImpl.class.getDeclaredMethod("collectReleaseRuntimeResources", Object.class, String.class, List.class, Object.class, String.class, Long.class, List.class, Map.class);
        method.setAccessible(true);
        List<ProjectReleaseRuntimeDatasourcePO> dataSources = new ArrayList<>();
        Map<Long, String> commonApiRefs = new LinkedHashMap<>();
        method.invoke(new ProjectReleaseServiceImpl(), com.alibaba.fastjson.JSON.parse(projectJson), "$",
                new ArrayList<>(), null, null, 1L, dataSources, commonApiRefs);
        return new RuntimeResourceResult(dataSources, commonApiRefs);
    }

    private Object invoke(Object target, String methodName) throws Exception {
        Method method = target.getClass().getDeclaredMethod(methodName);
        method.setAccessible(true);
        return method.invoke(target);
    }

    private record RuntimeResourceResult(List<ProjectReleaseRuntimeDatasourcePO> dataSources,
                                         Map<Long, String> commonApiRefs) {
    }
}
