/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import type {DesignerProjectSnapshot} from '@datavisool/sdk/plugin/contracts/designerRuntime';
import type {EditorReleaseOptions} from '@datavisool/sdk/plugin/contracts/editorProject';
import AuthFetchUtil from '@/util/AuthFetchUtil.ts';
import {HybridCryptoUtil} from '@/util/HybridCryptoUtil.ts';
import ProjectDataCodecUtil from '@/util/ProjectDataCodecUtil.ts';
import ProjectUtil, {type ProjectDependencyPayload} from '@/util/ProjectUtil.ts';
import type {QueueProjectWrite} from '../projectActions.ts';

export async function publishProject(
    snapshot: DesignerProjectSnapshot,
    remoteComponentPaths: Readonly<Record<string, string>>,
    options: EditorReleaseOptions,
    signal: AbortSignal,
    enqueue: QueueProjectWrite,
) {
    const {releaseType, encrypt, password, expirationDays} = options;
    if (encrypt && !password) throw new Error('开启加密时必须填写密码');
    const dependencies: ProjectDependencyPayload[] = [];
    await ProjectUtil.cyclicBuildReleaseDependencies(snapshot, dependencies, {signal, remoteComponentPaths});
    if (signal.aborted) return;
    for (const dependency of dependencies) {
        dependency.projectJson = ProjectDataCodecUtil.compressIfBeneficial(dependency.projectJson);
    }
    const encryptedPassword = encrypt ? await HybridCryptoUtil.encryptRequest(password, {signal}) : null;
    const releaseId = await enqueue(async () => {
        if (signal.aborted) return;
        return (await AuthFetchUtil.post<string | null>('/api/release/release', {
            projectId: snapshot.id, releaseType, encrypt, password: encryptedPassword,
            expirationDate: expirationDays ?? null, dependencies,
        })) ?? undefined;
    });
    if (!signal.aborted) return releaseId;
}
