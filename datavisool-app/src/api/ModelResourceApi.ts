/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

export interface IThreeDModelResource {
    id?: string;
    name?: string;
    url?: string;
    size?: number;
    type?: string;
    userId?: string;
    isCompressed?: number; // 0: 否, 1: 是
    createTime?: string;
}

export const modelResourcePagePath = '/api/model/page';
