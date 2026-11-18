/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import type {IProjectInfoManager} from '@datavisool/sdk/types';
import AuthFetchUtil, {type AuthRequestInit} from '@/util/AuthFetchUtil.ts';

export function createProject(project: IProjectInfoManager, options?: AuthRequestInit): Promise<string | null> {
    return AuthFetchUtil.post<string | null>('/api/project/create', project, options);
}
