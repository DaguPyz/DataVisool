#!/usr/bin/env node
/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

const fs = require('fs');
const os = require('os');
const path = require('path');
const {spawn} = require('child_process');
const {copyLauncherFiles, LAUNCHER_FILES} = require('../lib/launcher-files.cjs');
const {patchZipUnixCreator} = require('../lib/zip-unix-platform.cjs');

const isWindows = process.platform === 'win32';
const repoRoot = path.resolve(__dirname, '../../..');
const backendDir = path.join(repoRoot, 'datavisool-server');
const frontendPackageJson = require(path.join(repoRoot, 'package.json'));
const releaseVersion = frontendPackageJson.version || 'unknown';
const releasePackageBaseName = `datavisool-web-v${releaseVersion}-release`;
const releaseDocSourcePath = path.join(repoRoot, 'datavisool-doc', '部署说明.md');
const releaseConfigSourcePath = path.join(__dirname, 'application.yml');
const releaseJarFileName = 'server.jar';
const releaseConfigFileName = 'application.yml';
const releaseConfigDirectoryName = 'config';
const releaseConfigArchivePath = `${releaseConfigDirectoryName}/${releaseConfigFileName}`;

const optionDefinitions = {
    'local-jar': 'string',
    'component-docs': 'string',
    'output-dir': 'string',
    'service-name': 'string',
    'target-jdk': 'string',
    'jdk-home': 'string',
    'java-home': 'string',
    'maven-home': 'string',
    'mvn-command': 'string',
    'skip-build': 'boolean',
    'dry-run': 'boolean',
    'help': 'boolean',
};

const aliasMap = {
    h: 'help',
};

const cliOptions = parseArgs(process.argv.slice(2));

if (cliOptions.help) {
    printHelp();
    process.exit(0);
}

const releaseOutputDir = path.resolve(cliOptions.outputDir || path.join(__dirname, '../release'));
const releaseZipPath = path.join(releaseOutputDir, `${releasePackageBaseName}.zip`);

const rawConfig = {
    serviceName: firstDefined(cliOptions.serviceName, process.env.DEPLOY_SERVICE_NAME, 'DATAVISOOL WEB SERVER'),
    localJar: firstDefined(
        cliOptions.localJar,
        process.env.DEPLOY_LOCAL_JAR,
        path.join(backendDir, 'datavisool-service', 'target', 'server.jar')
    ),
    componentDocs: cliOptions.componentDocs,
    javaHome: firstDefined(
        cliOptions.targetJdk,
        cliOptions.jdkHome,
        cliOptions.javaHome,
        process.env.DEPLOY_TARGET_JDK,
        process.env.DEPLOY_JDK_HOME,
        process.env.JAVA_HOME
    ),
    mavenHome: firstDefined(cliOptions.mavenHome, process.env.MAVEN_HOME),
    mvnCommand: firstDefined(cliOptions.mvnCommand, process.env.DEPLOY_MVN_COMMAND, isWindows ? 'mvn.cmd' : 'mvn'),
    skipBuild: firstDefined(cliOptions.skipBuild, parseBooleanEnv(process.env.DEPLOY_SKIP_BUILD), false),
    dryRun: firstDefined(cliOptions.dryRun, parseBooleanEnv(process.env.DEPLOY_DRY_RUN), false),
};

const config = normalizeConfig(rawConfig);
validateConfig(config);

main().catch((error) => {
    logError(error.message);
    process.exit(1);
});

async function main() {
    if (!config.dryRun && fs.existsSync(releaseZipPath)) {
        throw new Error(`发布 ZIP 已存在，为避免覆盖请先移走它：${releaseZipPath}`);
    }

    const execEnv = buildExecEnv(config);
    const requiredCommands = [];
    const archiveCommand = selectArchiveCommand(execEnv);

    if (!config.skipBuild) {
        requiredCommands.push({label: 'Maven', command: config.mvnCommand});
    }

    requiredCommands.push({label: archiveCommandLabel(archiveCommand), command: archiveCommand});

    const resolvedCommands = resolveCommands(requiredCommands, execEnv);
    const releaseBundle = createReleaseBundle(config);

    try {
        printHeader(config);

        if (!config.skipBuild) {
            await runCommand('[1/2] 构建单服务产物', resolvedCommands[config.mvnCommand], [
                '-pl',
                'datavisool-service',
                '-am',
                'clean',
                'package',
                '-DskipTests',
            ], {
                cwd: backendDir,
                env: execEnv,
                dryRun: config.dryRun,
            });
        } else {
            logInfo('[1/2] 已跳过本地构建');
        }

        checkLocalJar(config);
        await prepareReleaseBundle(config, releaseBundle);
        await runCommand('[2/2] 生成标准 ZIP 发布包', resolvedCommands[archiveCommand], buildReleaseArchiveArgs(releaseBundle, archiveCommand), {
            cwd: releaseBundle.stagingDir,
            env: execEnv,
            dryRun: config.dryRun,
        });
        if (!config.dryRun && archiveCommand === 'powershell') {
            patchZipUnixCreator(releaseBundle.temporaryZipPath);
        }
        publishReleaseArchive(releaseBundle, config);

        if (config.dryRun) {
            logInfo('预览结束：未执行构建或生成 ZIP。');
        } else {
            logSuccess(`${config.serviceName} 发布包已生成: ${releaseZipPath}`);
        }
    } finally {
        cleanupReleaseBundle(releaseBundle, config);
    }
}

function parseArgs(args) {
    const options = {};

    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];

        if (!arg.startsWith('-')) {
            throw new Error(`无法识别的位置参数: ${arg}`);
        }

        if (arg.startsWith('--')) {
            const [rawName, inlineValue] = splitInlineValue(arg.slice(2));
            const optionName = rawName.trim();
            const optionType = optionDefinitions[optionName];

            if (!optionType) {
                throw new Error(`未知参数: --${optionName}`);
            }

            const optionKey = toCamelCase(optionName);

            if (optionType === 'boolean') {
                options[optionKey] = inlineValue === undefined ? true : parseBoolean(inlineValue, `--${optionName}`);
                continue;
            }

            let nextValue = inlineValue;
            if (nextValue === undefined) {
                nextValue = args[index + 1];
                if (nextValue === undefined || nextValue.startsWith('-')) {
                    throw new Error(`参数缺少取值: --${optionName}`);
                }
                index += 1;
            }

            options[optionKey] = nextValue;
            continue;
        }

        const shortName = arg.slice(1);
        const expandedName = aliasMap[shortName];
        if (!expandedName) {
            throw new Error(`未知参数: ${arg}`);
        }
        options[toCamelCase(expandedName)] = true;
    }

    return options;
}

function splitInlineValue(rawArgument) {
    const separatorIndex = rawArgument.indexOf('=');
    if (separatorIndex === -1) {
        return [rawArgument, undefined];
    }

    return [
        rawArgument.slice(0, separatorIndex),
        rawArgument.slice(separatorIndex + 1),
    ];
}

function parseBoolean(value, optionName) {
    const normalized = String(value).trim().toLowerCase();
    if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) {
        return true;
    }
    if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) {
        return false;
    }
    throw new Error(`${optionName} 只能取 true/false`);
}

function parseBooleanEnv(value) {
    if (value === undefined || value === null || value === '') {
        return undefined;
    }
    return parseBoolean(value, '环境变量');
}

function toCamelCase(value) {
    return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function firstDefined(...values) {
    for (const value of values) {
        if (value !== undefined && value !== null && value !== '') {
            return value;
        }
    }
    return undefined;
}

function normalizeConfig(input) {
    const localJar = resolveLocalPath(input.localJar);
    const javaHome = input.javaHome
        ? resolveLocalPath(input.javaHome)
        : undefined;
    const mavenHome = input.mavenHome
        ? resolveLocalPath(input.mavenHome)
        : undefined;
    return {
        serviceName: input.serviceName,
        localJar,
        componentDocs: input.componentDocs
            ? resolveLocalPath(input.componentDocs)
            : path.join(path.dirname(localJar), 'component-docs'),
        javaHome,
        mavenHome,
        mvnCommand: input.mvnCommand,
        skipBuild: Boolean(input.skipBuild),
        dryRun: Boolean(input.dryRun),
    };
}

function validateConfig(input) {
    if (!input.serviceName) {
        throw new Error('serviceName 不能为空');
    }
    if (!input.localJar) {
        throw new Error('localJar 不能为空');
    }
    if (input.javaHome && !fs.existsSync(input.javaHome)) {
        throw new Error(`targetJdk 不存在: ${input.javaHome}`);
    }
}

function buildExecEnv(input) {
    const env = {...process.env};
    const extraBinDirs = [];

    if (input.javaHome) {
        env.JAVA_HOME = input.javaHome;
        extraBinDirs.push(path.join(input.javaHome, 'bin'));
    }

    if (input.mavenHome) {
        env.MAVEN_HOME = input.mavenHome;
        extraBinDirs.push(path.join(input.mavenHome, 'bin'));
    }

    if (extraBinDirs.length > 0) {
        const originalPath = env.PATH || '';
        env.PATH = `${extraBinDirs.join(path.delimiter)}${path.delimiter}${originalPath}`;
    }

    return env;
}

function resolveCommands(commandList, env) {
    const resolved = {};

    for (const {label, command} of commandList) {
        const resolvedPath = resolveCommand(command, env);
        if (!resolvedPath) {
            throw new Error(`未找到 ${label} 命令: ${command}`);
        }
        resolved[command] = resolvedPath;
    }

    return resolved;
}

function resolveCommand(command, env) {
    if (path.isAbsolute(command) && fs.existsSync(command)) {
        return command;
    }

    const pathEntries = (env.PATH || '').split(path.delimiter).filter(Boolean);
    const extensions = isWindows
        ? (process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';')
        : [''];

    for (const entry of pathEntries) {
        if (path.isAbsolute(command)) {
            break;
        }

        if (isWindows) {
            const hasExtension = Boolean(path.extname(command));
            const candidates = hasExtension
                ? [path.join(entry, command)]
                : extensions.map((extension) => path.join(entry, `${command}${extension.toLowerCase()}`));

            for (const candidate of candidates) {
                if (fs.existsSync(candidate)) {
                    return candidate;
                }
            }
            continue;
        }

        const candidate = path.join(entry, command);
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }

    return null;
}

function ensureFileExists(filePath, errorPrefix) {
    if (!fs.existsSync(filePath)) {
        throw new Error(`${errorPrefix}: ${filePath}`);
    }
}

function resolveLocalPath(inputPath) {
    const expanded = expandHomeDir(inputPath);
    return path.isAbsolute(expanded)
        ? expanded
        : path.resolve(process.cwd(), expanded);
}

function expandHomeDir(inputPath) {
    if (!inputPath || inputPath === '~') {
        return inputPath === '~' ? os.homedir() : inputPath;
    }
    if (inputPath.startsWith('~/') || inputPath.startsWith('~\\')) {
        return path.join(os.homedir(), inputPath.slice(2));
    }
    return inputPath;
}

function checkLocalJar(input) {
    if (input.dryRun) {
        const exists = fs.existsSync(input.localJar);
        logInfo(`[校验] Dry Run 模式，Jar ${exists ? '已存在' : '当前不存在'}: ${input.localJar}`);
        return;
    }
    ensureFileExists(input.localJar, '未找到待发布的 Jar 产物');
}

function createReleaseBundle(input) {
    let workspacePath = path.join(releaseOutputDir, `.${releasePackageBaseName}-dry-run-${process.pid}`);
    if (!input.dryRun) {
        fs.mkdirSync(releaseOutputDir, {recursive: true});
        // mkdtemp creates a unique workspace that cleanup can safely remove for this run alone.
        workspacePath = fs.mkdtempSync(path.join(releaseOutputDir, `.${releasePackageBaseName}-`));
    }
    const stagingDir = path.join(workspacePath, 'staging');
    const stagingJarPath = path.join(stagingDir, releaseJarFileName);
    const stagingDocPath = path.join(stagingDir, '部署说明.md');
    const stagingConfigPath = path.join(stagingDir, releaseConfigDirectoryName, releaseConfigFileName);
    return {
        workspacePath,
        workspaceCreated: !input.dryRun,
        stagingDir,
        stagingJarPath,
        stagingDocPath,
        stagingConfigPath,
        zipPath: releaseZipPath,
        temporaryZipPath: path.join(workspacePath, 'release.zip'),
    };
}

async function prepareReleaseBundle(input, bundle) {
    const currentBundle = bundle || createReleaseBundle(input);
    if (input.dryRun) {
        return currentBundle;
    }

    ensureFileExists(input.localJar, '未找到待发布的 Jar 产物');
    ensureFileExists(releaseDocSourcePath, '未找到部署说明文档');
    ensureFileExists(releaseConfigSourcePath, '未找到常规部署 application.yml 模板');
    fs.mkdirSync(currentBundle.stagingDir, {recursive: true});
    fs.mkdirSync(path.dirname(currentBundle.stagingConfigPath), {recursive: true});
    fs.copyFileSync(input.localJar, currentBundle.stagingJarPath);
    const {copyComponentDocs, validateReleaseJar} = await import('../lib/docker-artifacts.mjs');
    validateReleaseJar(currentBundle.stagingJarPath);
    fs.copyFileSync(releaseDocSourcePath, currentBundle.stagingDocPath);
    fs.copyFileSync(releaseConfigSourcePath, currentBundle.stagingConfigPath);
    for (const name of ['LICENSE', 'THIRD_PARTY_NOTICES.txt']) {
        fs.copyFileSync(path.join(repoRoot, name), path.join(currentBundle.stagingDir, name));
    }
    copyLauncherFiles(currentBundle.stagingDir);
    copyComponentDocs(input.componentDocs, path.join(currentBundle.stagingDir, 'component-docs'));

    return currentBundle;
}

function selectArchiveCommand(env) {
    if (resolveCommand('python3', env)) {
        return 'python3';
    }

    if (resolveCommand('python', env)) {
        return 'python';
    }

    if (isWindows) {
        return 'powershell';
    }

    return 'zip';
}

function archiveCommandLabel(command) {
    if (command === 'python3' || command === 'python') {
        return 'Python';
    }
    if (command === 'powershell') {
        return 'PowerShell';
    }
    return 'ZIP';
}

function buildReleaseArchiveArgs(bundle, command) {
    if (command === 'python3' || command === 'python') {
        return ['-c', buildPythonZipCommand(bundle)];
    }

    if (command === 'powershell') {
        return [
            '-NoProfile',
            '-NonInteractive',
            '-ExecutionPolicy',
            'Bypass',
            '-Command',
            buildPowerShellArchiveCommand(bundle),
        ];
    }

    return [
        '-q',
        '-X',
        '-r',
        bundle.temporaryZipPath,
        releaseJarFileName,
        '部署说明.md',
        releaseConfigArchivePath,
        'component-docs',
        'LICENSE',
        'THIRD_PARTY_NOTICES.txt',
        ...LAUNCHER_FILES.map(({name}) => name),
    ];
}

function buildPythonZipCommand(bundle) {
    const zipPath = JSON.stringify(bundle.temporaryZipPath);
    const stagingDir = JSON.stringify(bundle.stagingDir);
    return [
        'import pathlib, zipfile',
        'from zipfile import ZIP_DEFLATED',
        `zip_path = pathlib.Path(${zipPath})`,
        `staging_dir = pathlib.Path(${stagingDir})`,
        'with zipfile.ZipFile(zip_path, "w", compression=ZIP_DEFLATED) as archive:',
        '    archive.write(staging_dir / "server.jar", arcname="server.jar")',
        '    archive.write(staging_dir / "部署说明.md", arcname="部署说明.md")',
        '    archive.write(staging_dir / "LICENSE", arcname="LICENSE")',
        '    archive.write(staging_dir / "THIRD_PARTY_NOTICES.txt", arcname="THIRD_PARTY_NOTICES.txt")',
        `    archive.write(staging_dir / "${releaseConfigArchivePath}", arcname="${releaseConfigArchivePath}")`,
        '    for document in sorted((staging_dir / "component-docs").rglob("*")):',
        '        if document.is_file():',
        '            archive.write(document, arcname=document.relative_to(staging_dir).as_posix())',
        ...LAUNCHER_FILES.flatMap(({name, mode}) => [
            `    entry = zipfile.ZipInfo.from_file(staging_dir / ${JSON.stringify(name)}, arcname=${JSON.stringify(name)})`,
            '    entry.create_system = 3',
            `    entry.external_attr = ${(0o100000 | mode) * 65536}`,
            `    archive.writestr(entry, (staging_dir / ${JSON.stringify(name)}).read_bytes(), compress_type=ZIP_DEFLATED)`,
        ]),
    ].join('\n');
}

function buildPowerShellArchiveCommand(bundle) {
    const archiveEntries = [
        [bundle.stagingJarPath, releaseJarFileName, 0o644],
        [bundle.stagingDocPath, '部署说明.md', 0o644],
        [path.join(bundle.stagingDir, 'LICENSE'), 'LICENSE', 0o644],
        [path.join(bundle.stagingDir, 'THIRD_PARTY_NOTICES.txt'), 'THIRD_PARTY_NOTICES.txt', 0o644],
        [bundle.stagingConfigPath, releaseConfigArchivePath, 0o644],
        ...LAUNCHER_FILES.map(({name, mode}) => [path.join(bundle.stagingDir, name), name, mode]),
    ];
    const addEntries = archiveEntries.map(([sourcePath, archivePath, mode]) =>
        `$entry = [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, ${toPowerShellSingleQuoted(sourcePath)}, ${toPowerShellSingleQuoted(archivePath)}, [System.IO.Compression.CompressionLevel]::Optimal); $entry.ExternalAttributes = ${(0o100000 | mode) << 16}`
    ).join('; ');

    return [
        'Add-Type -AssemblyName System.IO.Compression.FileSystem',
        `$stagingDir = ${toPowerShellSingleQuoted(bundle.stagingDir)}`,
        `$archive = [System.IO.Compression.ZipFile]::Open(${toPowerShellSingleQuoted(bundle.temporaryZipPath)}, [System.IO.Compression.ZipArchiveMode]::Create)`,
        'try {',
        `  ${addEntries}`,
        `  Get-ChildItem -LiteralPath ${toPowerShellSingleQuoted(path.join(bundle.stagingDir, 'component-docs'))} -Recurse -File | ForEach-Object {`,
        "    $relative = $_.FullName.Substring($stagingDir.Length + 1).Replace('\\', '/')",
        '    $entry = [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $_.FullName, $relative, [System.IO.Compression.CompressionLevel]::Optimal)',
        `    $entry.ExternalAttributes = ${(0o100000 | 0o644) << 16}`,
        '  }',
        '} finally { $archive.Dispose() }',
    ].join('; ');
}

function toPowerShellSingleQuoted(value) {
    return `'${String(value).replace(/'/g, "''")}'`;
}

function cleanupReleaseBundle(bundle, input) {
    if (!bundle || input.dryRun || !bundle.workspaceCreated) {
        return;
    }

    fs.rmSync(bundle.workspacePath, {recursive: true, force: true});
}

function publishReleaseArchive(bundle, input) {
    if (input.dryRun) {
        return;
    }

    try {
        // A hard link publishes atomically and fails if another process created the target first.
        // The temporary archive lives under releaseOutputDir, so both paths are on the same filesystem.
        fs.linkSync(bundle.temporaryZipPath, bundle.zipPath);
    } catch (error) {
        if (error.code === 'EEXIST') {
            throw new Error(`发布 ZIP 已存在，为避免覆盖请先移走它：${bundle.zipPath}`);
        }
        throw new Error(`无法安全发布 ZIP：${error.message}`);
    }

    fs.unlinkSync(bundle.temporaryZipPath);
}

function runCommand(stepLabel, command, args, options) {
    const commandText = formatCommand(command, args);
    logInfo(`${stepLabel}\n  ${commandText}`);

    if (options.dryRun) {
        return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            cwd: options.cwd,
            env: options.env,
            stdio: 'inherit',
            shell: isWindows && /\.(cmd|bat)$/i.test(command),
        });

        child.on('error', (error) => {
            reject(new Error(`${stepLabel} 失败: ${error.message}`));
        });

        child.on('exit', (code) => {
            if (code === 0) {
                resolve();
                return;
            }
            reject(new Error(`${stepLabel} 失败，退出码 ${code}`));
        });
    });
}

function formatCommand(command, args) {
    return [command, ...args].map(quoteForDisplay).join(' ');
}

function quoteForDisplay(value) {
    const text = String(value);
    if (text.length === 0) {
        return '""';
    }
    return /[\s"'\\]/.test(text) ? JSON.stringify(text) : text;
}

function printHeader(input) {
    const lines = [
        '',
        '========================================',
        `开始发布 ${input.serviceName}`,
        '========================================',
        `仓库根目录: ${repoRoot}`,
        `后端目录: ${backendDir}`,
        `本地产物: ${input.localJar}`,
        `组件文档: ${input.componentDocs}`,
        `发布包: ${releaseZipPath}`,
        `目标 JDK: ${input.javaHome || '(使用当前环境 JAVA_HOME/PATH)'}`,
        `本地构建: ${input.skipBuild ? '跳过' : '执行 Maven 单服务打包'}`,
        `Dry Run: ${input.dryRun ? '是' : '否'}`,
        '========================================',
        '',
    ];

    process.stdout.write(`${lines.join('\n')}\n`);
}

function printHelp() {
    const helpText = `
用法:
  node script/build/native/deploy.js [options]

说明:
  基于当前单服务链路发布 datavisool-service。
  默认流程: Maven 打包单服务产物 -> 在本机生成标准 ZIP 发布包。
  发布 ZIP 可以直接用系统自带压缩工具、Windows 资源管理器、macOS Finder 或 7-Zip 解压。
  ZIP 内包含 server.jar、component-docs/、部署说明.md 和 config/application.yml 配置模板。
  同时包含 Windows、Linux 和 macOS 的四个部署脚本（部署机无需 Node.js）。
  解压后可直接编辑 config/application.yml，填写实际数据库信息后按部署说明启动服务。
  发布包官方名称为 datavisool-web-v<版本号>-release.zip，默认输出到 script/build/release/ 目录。

常用参数:
  --local-jar <value>        本地 Jar 路径，默认 datavisool-server/datavisool-service/target/server.jar
  --component-docs <path>    同次构建的组件文档目录，默认本地 Jar 同目录的 component-docs
  --output-dir <path>        发布 ZIP 输出目录，默认 script/build/release/；相对路径以当前目录为基准
  --service-name <value>     显示的服务名称
  --target-jdk <path>        指定本次构建使用的目标 JDK 路径，会注入为 JAVA_HOME
  --jdk-home <path>          --target-jdk 的别名
  --java-home <value>        覆盖 JAVA_HOME
  --maven-home <value>       覆盖 MAVEN_HOME
  --mvn-command <value>      Maven 命令，Windows 默认 mvn.cmd，其他平台默认 mvn
  --skip-build               跳过本地 Maven 打包
  --dry-run                  只打印命令，不真正执行
  --help, -h                 查看帮助

环境变量:
  DEPLOY_SERVICE_NAME
  DEPLOY_LOCAL_JAR
  DEPLOY_TARGET_JDK
  DEPLOY_JDK_HOME
  DEPLOY_MVN_COMMAND
  DEPLOY_SKIP_BUILD
  DEPLOY_DRY_RUN
  JAVA_HOME
  MAVEN_HOME

示例:
  node script/build/native/deploy.js --dry-run
  node script/build/native/deploy.js --target-jdk /Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home
  node script/build/native/deploy.js --skip-build --local-jar datavisool-server/datavisool-service/target/server.jar
`.trim();

    process.stdout.write(`${helpText}\n`);
}

function logInfo(message) {
    process.stdout.write(`${message}\n`);
}

function logSuccess(message) {
    process.stdout.write(`\n发布成功: ${message}\n`);
}

function logError(message) {
    process.stderr.write(`\n发布失败: ${message}\n`);
}
