#! /usr/bin/env node
/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */


const {program} = require('commander');
const {resolve} = require('path');
const chalk = require('chalk');
const inquirer = require('inquirer');
const fs = require('fs-extra');
const Pack = require('../package.json');
const {createServer, build} = require('vite');
const react = require('@vitejs/plugin-react');
const path = require("node:path");
const zlib = require('node:zlib');
const crypto = require('node:crypto');

const {externalPackages, externalGlobals} = require('../config/externals');

const ensureTemplatePackageName = async (targetPath, name) => {
    const packagePath = resolve(targetPath, 'package.json');
    if (!await fs.pathExists(packagePath)) return;
    const packageJson = await fs.readJson(packagePath);
    packageJson.name = name;
    await fs.writeJson(packagePath, packageJson, {spaces: 2});
};

const getComponentEntry = (componentName) => {
    return resolve(process.cwd(), 'src/components', componentName, 'definition.ts');
};

const parseComponentNames = (names = []) => {
    return names
        .flatMap((item) => String(item).split(','))
        .map((item) => item.trim())
        .filter(Boolean);
};

const crcTable = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) {
            c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        }
        table[n] = c >>> 0;
    }
    return table;
})();

const crc32 = (buffer) => {
    let crc = 0xffffffff;
    for (const byte of buffer) {
        crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
};

const toDosDateTime = (date = new Date()) => {
    const year = Math.max(date.getFullYear(), 1980);
    const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
    const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
    return {dosTime, dosDate};
};

const collectFiles = async (dir, baseDir = dir) => {
    const entries = await fs.readdir(dir);
    const files = [];
    for (const entry of entries) {
        const abs = path.join(dir, entry);
        const stat = await fs.stat(abs);
        if (stat.isDirectory()) {
            files.push(...await collectFiles(abs, baseDir));
        } else if (stat.isFile()) {
            files.push({
                abs,
                rel: path.relative(baseDir, abs).split(path.sep).join('/'),
                mtime: stat.mtime,
            });
        }
    }
    return files;
};

const createZipArchive = async (sourceDir, zipPath) => {
    const files = await collectFiles(sourceDir);
    const localParts = [];
    const centralParts = [];
    let offset = 0;

    for (const file of files) {
        const raw = await fs.readFile(file.abs);
        const compressed = zlib.deflateRawSync(raw);
        const name = Buffer.from(file.rel);
        const {dosTime, dosDate} = toDosDateTime(file.mtime);
        const crc = crc32(raw);

        const localHeader = Buffer.alloc(30);
        localHeader.writeUInt32LE(0x04034b50, 0);
        localHeader.writeUInt16LE(20, 4);
        localHeader.writeUInt16LE(0x0800, 6);
        localHeader.writeUInt16LE(8, 8);
        localHeader.writeUInt16LE(dosTime, 10);
        localHeader.writeUInt16LE(dosDate, 12);
        localHeader.writeUInt32LE(crc, 14);
        localHeader.writeUInt32LE(compressed.length, 18);
        localHeader.writeUInt32LE(raw.length, 22);
        localHeader.writeUInt16LE(name.length, 26);
        localHeader.writeUInt16LE(0, 28);

        localParts.push(localHeader, name, compressed);

        const centralHeader = Buffer.alloc(46);
        centralHeader.writeUInt32LE(0x02014b50, 0);
        centralHeader.writeUInt16LE(20, 4);
        centralHeader.writeUInt16LE(20, 6);
        centralHeader.writeUInt16LE(0x0800, 8);
        centralHeader.writeUInt16LE(8, 10);
        centralHeader.writeUInt16LE(dosTime, 12);
        centralHeader.writeUInt16LE(dosDate, 14);
        centralHeader.writeUInt32LE(crc, 16);
        centralHeader.writeUInt32LE(compressed.length, 20);
        centralHeader.writeUInt32LE(raw.length, 24);
        centralHeader.writeUInt16LE(name.length, 28);
        centralHeader.writeUInt16LE(0, 30);
        centralHeader.writeUInt16LE(0, 32);
        centralHeader.writeUInt16LE(0, 34);
        centralHeader.writeUInt16LE(0, 36);
        centralHeader.writeUInt32LE(0, 38);
        centralHeader.writeUInt32LE(offset, 42);
        centralParts.push(centralHeader, name);

        offset += localHeader.length + name.length + compressed.length;
    }

    const centralSize = centralParts.reduce((sum, item) => sum + item.length, 0);
    const endHeader = Buffer.alloc(22);
    endHeader.writeUInt32LE(0x06054b50, 0);
    endHeader.writeUInt16LE(0, 4);
    endHeader.writeUInt16LE(0, 6);
    endHeader.writeUInt16LE(files.length, 8);
    endHeader.writeUInt16LE(files.length, 10);
    endHeader.writeUInt32LE(centralSize, 12);
    endHeader.writeUInt32LE(offset, 16);
    endHeader.writeUInt16LE(0, 20);

    await fs.ensureDir(path.dirname(zipPath));
    await fs.writeFile(zipPath, Buffer.concat([...localParts, ...centralParts, endHeader]));
};

const createRemoteEntryPlugin = (entry) => {
    const publicId = 'virtual:datavisool-remote-entry';
    const resolvedId = `\0${publicId}`;
    const normalizedEntry = entry.split(path.sep).join('/');
    return {
        name: 'datavisool-remote-entry',
        resolveId(id) {
            if (id === publicId) return resolvedId;
            return null;
        },
        load(id) {
            if (id !== resolvedId) return null;
            return [
                `import Definition from ${JSON.stringify(normalizedEntry)};`,
                'globalThis.__DATAVISOOL_REMOTE_COMPONENT_TEMP__ = Definition;',
                'export default Definition;',
            ].join('\n');
        },
        publicId,
    };
};

const extractInjectedCss = (code) => {
    const cssParts = [];
    const patterns = [
        /var\s+([A-Za-z_$][\w$]*)\s*=\s*document\.createElement\("style"\);\s*\1\.textContent\s*=\s*`([\s\S]*?)`\s*,\s*document\.head\.appendChild\(\1\);?/g,
        /var\s+([A-Za-z_$][\w$]*)\s*=\s*document\.createElement\("style"\);\s*\1\.textContent\s*=\s*"((?:\\.|[^"\\])*)"\s*;\s*document\.head\.appendChild\(\1\);?/g,
    ];
    let nextCode = code;
    for (const pattern of patterns) {
        nextCode = nextCode.replace(pattern, (_match, _varName, css) => {
            cssParts.push(css.replace(/\\"/g, '"').replace(/\\n/g, '\n'));
            return '';
        });
    }
    return {code: nextCode, css: cssParts.join('\n')};
};

const createRemoteAssetPlugin = (componentName) => {
    return {
        name: 'datavisool-remote-assets',
        enforce: 'post',
        generateBundle(_options, bundle) {
            const cssFiles = [];

            for (const chunk of Object.values(bundle)) {
                if (chunk.type !== 'chunk') continue;
                const extracted = extractInjectedCss(chunk.code);
                chunk.code = extracted.code;
                if (extracted.css.trim()) {
                    const hash = crypto.createHash('sha256').update(extracted.css).digest('hex').slice(0, 8);
                    const cssFileName = `assets/${componentName}-${hash}.css`;
                    this.emitFile({type: 'asset', fileName: cssFileName, source: extracted.css});
                    cssFiles.push(cssFileName);
                }
            }

            const assetFiles = [
                ...Object.values(bundle)
                    .filter((item) => item.type === 'asset')
                    .map((item) => item.fileName),
                ...cssFiles,
            ];
            const nonCssAssets = assetFiles.filter((fileName) => !fileName.endsWith('.css'));

            for (const chunk of Object.values(bundle)) {
                if (chunk.type !== 'chunk') continue;
                for (const assetFile of nonCssAssets) {
                    const quoted = JSON.stringify(assetFile);
                    chunk.code = chunk.code.split(quoted).join(`__DATAVISOOL_REMOTE_ASSET_URL__(${quoted})`);
                    const absoluteQuoted = JSON.stringify(`/${assetFile}`);
                    chunk.code = chunk.code.split(absoluteQuoted).join(`__DATAVISOOL_REMOTE_ASSET_URL__(${quoted})`);
                }
                if (chunk.isEntry) {
                    const entryFileName = `${componentName}.js`;
                    const bootstrap = [
                        `var __DATAVISOOL_REMOTE_ENTRY_FILE__=${JSON.stringify(entryFileName)};`,
                        'var __DATAVISOOL_REMOTE_CURRENT_SCRIPT__=typeof document!=="undefined"?document.currentScript:null;',
                        'if(!__DATAVISOOL_REMOTE_CURRENT_SCRIPT__&&typeof document!=="undefined"){var __DATAVISOOL_REMOTE_SCRIPTS__=document.getElementsByTagName("script");for(var __DATAVISOOL_REMOTE_I__=__DATAVISOOL_REMOTE_SCRIPTS__.length-1;__DATAVISOOL_REMOTE_I__>=0;__DATAVISOOL_REMOTE_I__--){var __DATAVISOOL_REMOTE_SRC__=__DATAVISOOL_REMOTE_SCRIPTS__[__DATAVISOOL_REMOTE_I__].src||__DATAVISOOL_REMOTE_SCRIPTS__[__DATAVISOOL_REMOTE_I__].getAttribute("src")||"";if(__DATAVISOOL_REMOTE_SRC__.indexOf(__DATAVISOOL_REMOTE_ENTRY_FILE__)>=0){__DATAVISOOL_REMOTE_CURRENT_SCRIPT__=__DATAVISOOL_REMOTE_SCRIPTS__[__DATAVISOOL_REMOTE_I__];break}}}',
                        'var __DATAVISOOL_REMOTE_BASE_MAP__=typeof globalThis!=="undefined"&&globalThis.__DATAVISOOL_REMOTE_COMPONENT_BASE_URL_MAP__||{};',
                        'var __DATAVISOOL_REMOTE_MAPPED_BASE_URL__=__DATAVISOOL_REMOTE_BASE_MAP__[__DATAVISOOL_REMOTE_ENTRY_FILE__]||"";',
                        'var __DATAVISOOL_REMOTE_SCRIPT_SRC__=__DATAVISOOL_REMOTE_CURRENT_SCRIPT__&&(__DATAVISOOL_REMOTE_CURRENT_SCRIPT__.src||__DATAVISOOL_REMOTE_CURRENT_SCRIPT__.getAttribute("src"))||"";',
                        'var __DATAVISOOL_REMOTE_SCRIPT_BASE_URL__=__DATAVISOOL_REMOTE_SCRIPT_SRC__&&__DATAVISOOL_REMOTE_SCRIPT_SRC__.lastIndexOf("/")>=0?__DATAVISOOL_REMOTE_SCRIPT_SRC__.slice(0,__DATAVISOOL_REMOTE_SCRIPT_SRC__.lastIndexOf("/")+1):"";',
                        'var __DATAVISOOL_REMOTE_BASE_URL__=__DATAVISOOL_REMOTE_MAPPED_BASE_URL__||__DATAVISOOL_REMOTE_SCRIPT_BASE_URL__;',
                        'var __DATAVISOOL_REMOTE_ASSET_URL__=function(p){if(!p||/^(?:[a-z][a-z0-9+.-]*:|\\/)/i.test(p))return p;if(!__DATAVISOOL_REMOTE_BASE_URL__)return p;return __DATAVISOOL_REMOTE_BASE_URL__+p.replace(/^\\.\\//,"")};',
                        `(function(){if(typeof document==="undefined")return;${JSON.stringify(cssFiles)}.forEach(function(p){var href=__DATAVISOOL_REMOTE_ASSET_URL__(p);if(document.querySelector('link[data-datavisool-remote-style="'+href+'"]'))return;var link=document.createElement("link");link.rel="stylesheet";link.href=href;link.setAttribute("data-datavisool-remote-style",href);document.head.appendChild(link);});})();`,
                        '',
                    ].join('\n');
                    chunk.code = bootstrap + chunk.code;
                }
            }
        },
    };
};


//首行提示
program.name(Pack.name).usage('<command> [options]')
//版本号
program.version(Pack.version);
//命令
program.command('create <name> [destination]')
    .description('create a new DataVisool component')
    .action(async (name, destination) => {
        const targetPath = resolve(process.cwd(), destination || name);
        const cliDir = resolve(__dirname, '../template');
        if (fs.existsSync(targetPath)) {
            //存在同名目录
            const answer = await inquirer.prompt([
                {
                    message: '目录已存在，是否覆盖？',
                    type: 'confirm',
                    name: 'overwrite',
                    default: false
                }
            ])
            if (!answer.overwrite) {
                console.log(chalk.yellow('create canceled.'));
                return;
            }
            await fs.remove(targetPath);
        }
        //复制template目录下的所有文件到当前工作空间下
        await fs.copy(cliDir, targetPath);
        await ensureTemplatePackageName(targetPath, name);
        console.log(chalk.green(`create ${name} success. now you can do this\n`))
        console.log(chalk.blue(`cd ${destination || name} && pnpm install`))
        console.log(chalk.blue(`pnpm dev`))
        console.log(chalk.blue(`pnpm build`))
    })

program.command('dev')
    .description('start the development server')
    .action(async () => {
        const server = await createServer({
            mode: 'development',
            root: process.cwd(),
            plugins: [
                react(),
            ],
            server: {
                port: 3000
            },
        })
        await server.listen()
        server.printUrls()
    })


/**
 * 打包单个组件
 * @param name
 * @param entry
 * @returns {Promise<void>}
 */
const buildPackage = async (name, entry) => {
    const outDir = resolve(process.cwd(), 'dist', name);
    const zipPath = resolve(process.cwd(), 'dist', `${name}.zip`);
    const remoteEntryPlugin = createRemoteEntryPlugin(entry);
    await fs.remove(outDir);
    await fs.remove(zipPath);
    await build({
        mode: 'production',
        root: process.cwd(),
        define: {
            'process.env.NODE_ENV': JSON.stringify('production')
        },
        plugins: [
            remoteEntryPlugin,
            react({jsxRuntime: 'classic'}),
            createRemoteAssetPlugin(name),
        ],
        build: {
            outDir,
            emptyOutDir: false,
            assetsInlineLimit: 0,
            cssCodeSplit: true,
            rollupOptions: {
                input: remoteEntryPlugin.publicId,
                treeshake: true,
                external: externalPackages,
                output: {
                    format: 'iife',
                    name: '__DATAVISOOL_REMOTE_COMPONENT_TEMP__',
                    entryFileNames: `${name}.js`,
                    chunkFileNames: 'chunks/[name]-[hash].js',
                    assetFileNames: 'assets/[name]-[hash][extname]',
                    inlineDynamicImports: true,
                    minifyInternalExports: false,
                    globals: externalGlobals,
                }
            }
        }
    });
    await createZipArchive(outDir, zipPath);
    console.log(chalk.green(`zip package generated: ${path.relative(process.cwd(), zipPath)}`));
}


program.command('build [names...]')
    .description('Build the project, Only use the build command to package all components, ' +
        'and the specified components can be followed by the specific component directory name after the build command, and multiple components can be split by ","')
    .action(async (names) => {
        let componentEntries = {};
        const componentNames = parseComponentNames(names);
        if (componentNames.length > 0) {
            componentEntries = componentNames.reduce((acc, curr) => {
                acc[curr] = getComponentEntry(curr);
                return acc;
            }, {});
        } else {
            //打包component目录下的所有组件
            const componentPath = resolve(process.cwd(), 'src/components');
            if (!await fs.pathExists(componentPath)) {
                console.log(chalk.red('src/components directory is not exist.'));
                process.exitCode = 1;
                return;
            }
            const files = await fs.readdir(componentPath);
            // 过滤出子文件夹
            const subdirectories = [];
            for (const file of files) {
                const filePath = path.join(componentPath, file);
                const stat = await fs.stat(filePath);
                if (stat.isDirectory() && await fs.pathExists(path.join(filePath, 'definition.ts'))) {
                    subdirectories.push(file);
                }
            }
            if (!subdirectories || subdirectories.length === 0) {
                console.log(chalk.red('No component definitions found in the src/components directory.'));
                process.exitCode = 1;
                return;
            }
            componentEntries = subdirectories.reduce((acc, curr) => {
                acc[curr] = getComponentEntry(curr);
                return acc;
            }, {});
        }

        const missingEntries = Object.entries(componentEntries).filter(([, entry]) => !fs.existsSync(entry));
        if (missingEntries.length > 0) {
            missingEntries.forEach(([componentName, entry]) => {
                console.log(chalk.red(`component "${componentName}" is not exist. error path ${entry}`));
            });
            process.exitCode = 1;
            return;
        }

        //清空输出目录
        await fs.remove(resolve(process.cwd(), 'dist'));
        for (const [n, entry] of Object.entries(componentEntries)) {
            console.log(chalk.bold.blue(`===============> building ${n} <==================`));
            await buildPackage(n, entry);
            console.log(chalk.bold.green(`===============> ${n} build success <==================\n`));
        }
    })


// 解析命令行参数
program.parse(process.argv)
const options = program.opts();
