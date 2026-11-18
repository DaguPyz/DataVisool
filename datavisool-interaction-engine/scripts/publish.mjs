/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runPublishCli} from '../../script/packages/publish-package.mjs';

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    await runPublishCli({
        cwd: fileURLToPath(new URL('../', import.meta.url)),
        expectedName: '@datavisool/interaction-engine',
        packageDirectory: 'datavisool-interaction-engine',
        releaseCommand: 'pnpm release:datavisool-interaction-engine',
    });
}
