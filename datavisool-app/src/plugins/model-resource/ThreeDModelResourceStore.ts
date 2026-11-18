/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {modelResourcePagePath, type IThreeDModelResource} from "@/api/ModelResourceApi.ts";
import {BaseResourceStore} from "@/shared/resources/BaseResourceStore.ts";

export class ThreeDModelResourceStore extends BaseResourceStore<IThreeDModelResource> {
    getListApiUrl = modelResourcePagePath;
    deleteApiUrl = '/api/model/batchDelete';
    updateApiUrl = '/api/model/update';
    protected retainSearchValue = true;
    protected correctOutOfRangePage = true;
}

