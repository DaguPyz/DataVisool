/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import {defineConfig} from 'vite';
import dts from 'vite-plugin-dts';
import path from 'node:path';

export default defineConfig({
    plugins: [dts({include: ['src'], entryRoot: 'src'})],
    build: {
        copyPublicDir: false,
        lib: {
            entry: Object.fromEntries(['main', 'core', 'utils', 'react', 'host', 'types'].map(name => [name, path.resolve(__dirname, `src/${name}.ts`)])),
            formats: ['es'],
            fileName: (_format, name) => `${name}.js`,
        },
        rollupOptions: {
            external: id => /^(react|react-dom|@icon-park\/react|nanoid)(\/|$)/.test(id),
        },
    },
});
