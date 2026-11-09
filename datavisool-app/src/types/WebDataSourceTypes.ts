/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import type {IDatabase} from '@datavisool/sdk/types';

/** Database options maintained by the Web application and its release service. */
export interface WebDatabaseConfig extends IDatabase {
    runtimeDataSourceId?: string;
    allowSqlScript?: boolean;
}
