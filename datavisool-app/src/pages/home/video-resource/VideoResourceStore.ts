/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {BaseResourceStore, IBaseResource} from "@/pages/home/common/BaseResourceStore.ts";

export interface IVideoResource extends IBaseResource {
    name?: string;
    url?: string;
    size?: number;
    type?: string;
    userId?: string;
    createTime?: string;
}

export class VideoResourceStore extends BaseResourceStore<IVideoResource> {
    getListApiUrl = '/api/video/page';
    deleteApiUrl = '/api/video/batchDelete';
    updateApiUrl = '/api/video/update';
    protected retainSearchValue = true;
    protected correctOutOfRangePage = true;
}

const videoResourceStore = new VideoResourceStore();
export default videoResourceStore;
