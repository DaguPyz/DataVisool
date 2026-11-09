/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {afterEach, beforeEach, expect, it} from 'vitest';
import ProjectUtil from '@/util/ProjectUtil';

const previousEnv = window.DATAVISOOL_ENV;
beforeEach(() => { window.DATAVISOOL_ENV = {definitions: {}} as any; });
afterEach(() => { window.DATAVISOOL_ENV = previousEnv; });

const api = (id: string) => ({sourceType: 'commonApi', commonApi: {commonApiId: id}});
const database = (id: string) => ({sourceType: 'database', database: {targetDb: id}});

it('collects component data sources in normal and nested loop managers only', async () => {
    const data = {
        layerManager: {elemConfigs: {
            chart: {base: {type: 'Chart'}, data: api('root-api')},
            loop: {base: {type: 'LoopContainer'}, managerData: {
                layerManager: {elemConfigs: {
                    nested: {base: {type: 'LoopContainer'}, managerData: {
                        layerManager: {elemConfigs: {
                            deepest: {base: {type: 'Chart'}, data: database('deepest-db')},
                        }},
                    }},
                }},
                globalVariableManager: {globalVariables: {
                    nested: {triggerSource: api('nested-variable-api')},
                }},
            }},
            payload: {base: {type: 'Chart'}, data: {
                sourceType: 'static',
                staticData: {value: {
                    data: database('payload-db'),
                    managerData: {
                        layerManager: {elemConfigs: {fake: {data: database('fake-manager-db')}}},
                        globalVariableManager: {globalVariables: {fake: {triggerSource: api('fake-manager-api')}}},
                    },
                }},
            }},
        }}, globalVariableManager: {globalVariables: {
            root: {triggerSource: api('root-variable-api')},
        }},
    } as any;

    expect(ProjectUtil.collectComponentCommonApiIds(data)).toEqual(['root-api']);
    expect(ProjectUtil.collectComponentDatabaseIds(data)).toEqual(['deepest-db']);
    expect(ProjectUtil.collectGlobalVariableCommonApiIds(data)).toEqual(['nested-variable-api', 'root-variable-api']);
    const packageDependencies = ProjectUtil.calculateProjectDependencyByProject('screen', 'Screen', data);
    expect(packageDependencies.commonApiIds).toEqual(['root-api', 'nested-variable-api', 'root-variable-api']);
    expect(packageDependencies.databaseIds).toEqual(['deepest-db']);
    const releaseDependencies: any[] = [];
    await ProjectUtil.cyclicBuildReleaseDependencies({id: 'screen', name: 'Screen', data} as any, releaseDependencies);
    expect(releaseDependencies[0].commonApiIds).toEqual(packageDependencies.commonApiIds);
    expect(releaseDependencies[0].databaseIds).toEqual(packageDependencies.databaseIds);
});

it('collects GIS data sources only from live GeoJSON dataConfig sources', async () => {
    const data = {
        layerManager: {elemConfigs: {
            map: {base: {type: 'MapLibreGis'}, style: {sources: {
                active: {sourceType: 'geojson', dataMode: 'dataConfig', dataConfig: database('gis-db')},
                inline: {sourceType: 'geojson', dataMode: 'inline', dataConfig: database('unused-inline-db')},
                tiles: {sourceType: 'vector', dataMode: 'dataConfig', dataConfig: database('unused-vector-db')},
            }}},
            payload: {base: {type: 'MapLibreGis'}, data: {staticData: {value: {style: {sources: {
                fake: {sourceType: 'geojson', dataMode: 'dataConfig', dataConfig: api('payload-api')},
            }}}}}},
        }},
    } as any;

    expect(ProjectUtil.collectGisDatabaseIds(data)).toEqual(['gis-db']);
    expect(ProjectUtil.collectGisCommonApiIds(data)).toEqual([]);
    const packageDependencies = ProjectUtil.calculateProjectDependencyByProject('map', 'Map', data);
    expect(packageDependencies.databaseIds).toEqual(['gis-db']);
    expect(packageDependencies.commonApiIds).toEqual([]);
    const releaseDependencies: any[] = [];
    await ProjectUtil.cyclicBuildReleaseDependencies({id: 'map', name: 'Map', data} as any, releaseDependencies);
    expect(releaseDependencies[0].databaseIds).toEqual(packageDependencies.databaseIds);
});

it('collects API and database dependencies from the first GIS source in root and loop managers for export and release', async () => {
    const gisSource = (dataConfig: ReturnType<typeof api> | ReturnType<typeof database>) => ({
        sourceType: 'geojson',
        dataMode: 'dataConfig',
        dataConfig,
    });
    const data = {
        layerManager: {elemConfigs: {
            rootMap: {base: {type: 'MapLibreGis'}, style: {sources: [
                gisSource(api('root-first-api')),
                gisSource(database('root-second-db')),
            ]}},
            loop: {base: {type: 'LoopContainer'}, managerData: {
                layerManager: {elemConfigs: {
                    nestedMap: {base: {type: 'MapLibreGis'}, style: {sources: [
                        gisSource(database('loop-first-db')),
                        gisSource(api('loop-second-api')),
                    ]}},
                }},
            }},
        }},
    } as any;

    const packageDependencies = ProjectUtil.calculateProjectDependencyByProject('map', 'Map', data);
    expect(packageDependencies.commonApiIds).toEqual(['root-first-api', 'loop-second-api']);
    expect(packageDependencies.databaseIds).toEqual(['root-second-db', 'loop-first-db']);

    const releaseDependencies: any[] = [];
    await ProjectUtil.cyclicBuildReleaseDependencies({id: 'map', name: 'Map', data} as any, releaseDependencies);
    expect(releaseDependencies[0].commonApiIds).toEqual(packageDependencies.commonApiIds);
    expect(releaseDependencies[0].databaseIds).toEqual(packageDependencies.databaseIds);
});
