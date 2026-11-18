/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

export interface IDataSource {
    id?: string;
    key?: string;
    name?: string;
    type?: string;
    username?: string;
    password?: string;
    ip?: string;
    port?: string;
    databaseName?: string;
    url?: string;
    des?: string;
    allowSqlScript?: boolean;
}
