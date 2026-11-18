/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import {spawn} from 'node:child_process';
import {readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createInterface} from 'node:readline/promises';
const registry = 'https://registry.npmjs.org/';
const registryArg = `--registry=${registry}`;
const queryArgs = [registryArg, '--prefer-online', '--fetch-retries=0', '--fetch-timeout=15000'];
const numeric = '(?:0|[1-9]\\d*)';
const identifier = `(?:${numeric}|\\d*[a-zA-Z-][0-9a-zA-Z-]*)`;
const versionPattern = new RegExp(`^${numeric}\\.${numeric}\\.${numeric}(?:-${identifier}(?:\\.${identifier})*)?$`);

class Cancelled extends Error {
    constructor(exitCode = 0) {
        super('已取消发布。');
        this.exitCode = exitCode;
    }
}

function validVersion(value) {
    return versionPattern.test(value)
        && value.split('-')[0].split('.').every((part) => Number.isSafeInteger(Number(part)));
}

function command(commandName, args, {cwd, capture = false}) {
    return new Promise((resolve, reject) => {
        const child = spawn(commandName, args, {
            cwd,
            // Windows 的 npm/pnpm 是 .cmd；命令参数均由脚本生成或经过校验。
            shell: process.platform === 'win32',
            stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
        });
        let stdout = '';
        let stderr = '';
        if (capture) {
            child.stdout.on('data', (chunk) => { stdout += chunk; });
            child.stderr.on('data', (chunk) => { stderr += chunk; });
        }
        child.on('error', (error) => reject(new Error(`无法启动 ${commandName}：${error.message}`)));
        child.on('close', (code, signal) => {
            if (signal === 'SIGINT') reject(new Cancelled(130));
            else resolve({code, stdout, stderr});
        });
    });
}

async function question(text) {
    const controller = new AbortController();
    const input = createInterface({input: process.stdin, output: process.stdout});
    input.on('SIGINT', () => controller.abort());
    input.on('close', () => controller.abort());
    try {
        return (await input.question(text, {signal: controller.signal})).trim();
    } catch (error) {
        if (error.name === 'AbortError') throw new Cancelled(130);
        throw error;
    } finally {
        input.close();
    }
}

function npmErrorCode(result) {
    try {
        const data = JSON.parse(result.stdout);
        if (typeof data.error?.code === 'string') return data.error.code;
    } catch {
        // 未启用 --json 的命令将错误码输出到 stderr。
    }
    return result.stderr.match(/\b(?:ENEEDAUTH|E401|E403|E404|E5\d\d|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNRESET|ECONNREFUSED|FETCH_ERROR)\b/)?.[0];
}

function requireSuccess(result, label) {
    if (result.code === 0) return;
    const details = (result.stderr || result.stdout || '').trim();
    throw new Error(`${label}失败（退出码 ${result.code}）。${details ? `\n${details}` : ''}`);
}

function parseJSON(result, label) {
    requireSuccess(result, label);
    try {
        return JSON.parse(result.stdout);
    } catch {
        throw new Error(`${label}返回了无效的 JSON，请检查 npm 输出后重试。`);
    }
}

async function waitForPublishedPackage({name, version, run, log, wait, now, checkTarball, timeoutMs, intervalMs, submitted, releaseCommand}) {
    const start = now();
    const deadline = start + timeoutMs;
    const target = `${name}@${version}`;
    const showUnconfirmed = (status, detail) => {
        log(`\n当前状态：${submitted ? '上传命令已完成，' : ''}${detail}，尚未确认可安装。`);
        log(`稍后运行 ${releaseCommand} --verify-only 查询当前本地版本 ${target} 的状态。${submitted ? '\n请勿重复发布该版本。' : ''}`);
        return {status, detail};
    };
    let status = 'pending';
    let detail = 'registry 尚未显示目标版本';
    log(submitted
        ? `\n上传命令已完成，等待 ${target} 的版本信息和下载地址可用。`
        : `\n仅查询 ${target} 的版本信息和下载地址。`);
    log(`每 ${intervalMs / 1000} 秒重查，最多等待 ${timeoutMs / 60000} 分钟。`);

    while (now() < deadline) {
        const requestTimeout = Math.max(1, Math.min(15000, deadline - now()));
        const args = queryArgs.map((arg) => arg.startsWith('--fetch-timeout=') ? `--fetch-timeout=${requestTimeout}` : arg);
        let result;
        try {
            result = await run('npm', ['view', target, 'version', 'dist.tarball', '--json', ...args], true);
        } catch (error) {
            if (error instanceof Cancelled) throw error;
            return showUnconfirmed('unverified', `查询命令无法执行：${error.message}`);
        }

        if (result.code !== 0) {
            const code = npmErrorCode(result);
            if (code === 'E404') {
                status = 'pending';
                detail = 'registry 尚未显示目标版本（404），npm 可能仍在处理';
            } else if (/^(?:E5\d\d|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNRESET|ECONNREFUSED|FETCH_ERROR)$/.test(code ?? '')) {
                status = 'unverified';
                detail = `查询暂不可用（${code}）`;
            } else {
                const reason = ['ENEEDAUTH', 'E401', 'E403'].includes(code) ? '查询权限异常' : '查询异常';
                return showUnconfirmed('unverified', `${reason}（${code ?? `退出码 ${result.code}`}）`);
            }
        } else {
            let metadata;
            try {
                metadata = parseJSON(result, '查询发布结果');
            } catch (error) {
                return showUnconfirmed('unverified', error.message);
            }
            // npm 在只返回 version 字段时会把 JSON 对象简化为版本字符串。
            if (metadata === version) metadata = {version};
            if (metadata?.version !== version) {
                return showUnconfirmed('unverified', 'registry 返回的版本与目标版本不一致');
            }
            if (metadata['dist.tarball'] == null) {
                status = 'pending';
                detail = '版本信息已可见，下载地址尚未提供';
            } else if (typeof metadata['dist.tarball'] !== 'string') {
                return showUnconfirmed('unverified', 'registry 返回的下载地址无效');
            } else try {
                const tarball = new URL(metadata['dist.tarball']);
                if (tarball.protocol !== 'https:') throw new Error('下载地址须为 HTTPS');
                if (now() >= deadline) {
                    status = 'pending';
                    detail = '版本信息已可见，下载地址尚未验证';
                    break;
                }
                const response = await checkTarball(tarball.href, {
                    method: 'HEAD', signal: AbortSignal.timeout(Math.max(1, Math.min(15000, deadline - now()))),
                });
                if (response.status === 200) {
                    log(`发布完成，版本及下载地址已可用：${target}\nhttps://www.npmjs.com/package/${name}/v/${version}`);
                    return {status: 'available'};
                }
                if (![202, 404, 429].includes(response.status) && response.status < 500) {
                    return showUnconfirmed('unverified', `版本信息已可见，下载地址查询异常（HTTP ${response.status}）`);
                }
                status = response.status === 202 || response.status === 404 ? 'pending' : 'unverified';
                detail = `版本信息已可见，下载地址暂不可用（HTTP ${response.status}）`;
            } catch (error) {
                if (error instanceof Cancelled) throw error;
                status = 'unverified';
                detail = `版本信息已可见，下载地址查询失败：${error.message}`;
            }
        }

        const delay = Math.min(intervalMs, Math.max(0, deadline - now()));
        if (delay === 0) break;
        log(`[已等待 ${Math.floor((now() - start) / 1000)} 秒] ${detail}；${Math.ceil(delay / 1000)} 秒后重查。`);
        await wait(delay);
    }
    log(`等待已达到 ${timeoutMs / 60000} 分钟。`);
    return showUnconfirmed(status, detail);
}

export async function publishPackage({
    cwd = process.cwd(),
    expectedName,
    releaseCommand = 'pnpm release:datavisool-ui',
    execute = command,
    ask = question,
    log = console.log,
    wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now = Date.now,
    checkTarball = (url, options) => fetch(url, options),
    verificationTimeoutMs = 10 * 60 * 1000,
    verificationIntervalMs = 10 * 1000,
    verifyOnly = false,
} = {}) {
    const manifestPath = path.join(cwd, 'package.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    const {name, version: localVersion} = manifest;
    if (!/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(name ?? '') || !validVersion(localVersion ?? '')) {
        throw new Error('package.json 中的包名或版本号无效。');
    }
    if (expectedName && name !== expectedName) throw new Error(`包名不匹配：预期 ${expectedName}，实际 ${name}。`);
    const run = (bin, args, capture = false) => execute(bin, args, {cwd, capture});
    const verify = (version, submitted) => waitForPublishedPackage({
        name, version, run, log, wait, now, checkTarball, submitted, releaseCommand,
        timeoutMs: verificationTimeoutMs, intervalMs: verificationIntervalMs,
    });
    if (verifyOnly) return {name, version: localVersion, ...await verify(localVersion, false)};
    log(`发布包：${name}\n本地版本：${localVersion}\n目标 registry：${registry}`);

    let identity = await run('npm', ['whoami', ...queryArgs], true);
    if (identity.code !== 0 && ['ENEEDAUTH', 'E401'].includes(npmErrorCode(identity))) {
        if (!/^(y|yes)$/i.test(await ask('尚未登录或登录已过期，是否登录 npm？[y/N]：'))) throw new Cancelled();
        requireSuccess(await run('npm', ['login', '--auth-type=legacy', registryArg]), 'npm 登录');
        identity = await run('npm', ['whoami', ...queryArgs], true);
    }
    requireSuccess(identity, '查询登录账号');
    const account = identity.stdout.trim();
    if (!account || /\s/.test(account)) throw new Error('npm 未返回有效的登录账号。');
    log(`当前 npm 账号：${account}`);

    const versionResult = await run('npm', ['view', name, 'versions', '--json', ...queryArgs], true);
    let versions = [];
    if (versionResult.code !== 0 && npmErrorCode(versionResult) === 'E404') {
        log('registry 中未找到该包，将尝试首次发布。');
    } else {
        const data = parseJSON(versionResult, '查询已发布版本');
        versions = typeof data === 'string' ? [data] : data;
        if (!Array.isArray(versions) || !versions.every((value) => typeof value === 'string')) {
            throw new Error('npm 返回的版本列表格式无效。');
        }
        log(`已发布版本：${versions.join(', ') || '无'}`);
    }

    const defaultVersion = versions.includes(localVersion) ? '' : localVersion;
    let version;
    while (true) {
        version = (await ask(`输入发布版本${defaultVersion ? ` [${defaultVersion}]` : '（当前版本已发布）'}：`)) || defaultVersion;
        if (!validVersion(version)) log('请输入有效版本号，例如 0.0.2 或 0.1.0-beta.1。');
        else if (versions.includes(version)) log(`${version} 已经发布，请输入新的版本号。`);
        else break;
    }

    const prerelease = version.split('-')[1]?.split('.')[0];
    const defaultTag = prerelease ? (/^[a-z][a-z0-9_-]*$/.test(prerelease) ? prerelease : 'next') : 'latest';
    let tag;
    do {
        tag = (await ask(`输入发布标签 [${defaultTag}]：`)) || defaultTag;
        if (!/^[a-z][a-z0-9_-]*$/.test(tag)) log('标签须以小写字母开头，只包含小写字母、数字、下划线或短横线。');
    } while (!/^[a-z][a-z0-9_-]*$/.test(tag));

    if (version !== localVersion) {
        // 仅更新版本字段；读取最新内容，保留用户的其他改动。
        const current = JSON.parse(await readFile(manifestPath, 'utf8'));
        if (current.name !== name || current.version !== localVersion) throw new Error('包名或版本在操作期间发生变化，请重新运行脚本。');
        current.version = version;
        await writeFile(manifestPath, `${JSON.stringify(current, null, 2)}\n`);
        log(`package.json 的版本已更新为 ${version}；取消或失败后也会保留此版本。`);
    }

    const publishArgs = ['publish', '--access', 'public', '--tag', tag, '--no-git-checks', registryArg];
    log('\n开始发布预演，prepublishOnly 会自动构建 dist。');
    requireSuccess(await run('pnpm', [...publishArgs, '--dry-run']), '发布预演');
    log(`\n账号：${account}\n包：${name}@${version}\n标签：${tag}\n可见性：public\nregistry：${registry}`);
    if (!/^(y|yes)$/i.test(await ask('确认正式发布到 npm？[y/N]：'))) throw new Cancelled();

    const current = JSON.parse(await readFile(manifestPath, 'utf8'));
    if (current.name !== name || current.version !== version) throw new Error('包名或版本在预演后发生变化，请重新运行脚本。');
    // 不捕获 stdin/stdout，让 npm 的登录、验证码或浏览器验证直接使用当前终端。
    requireSuccess(await run('pnpm', publishArgs), '正式发布');

    return {name, version, tag, account, ...await verify(version, true)};
}

export async function runPublishCli({cwd, expectedName, packageDirectory, releaseCommand}) {
    try {
        const args = process.argv.slice(2);
        if (args.length === 1 && args[0] === '--help') {
            console.log(`用法：${releaseCommand}（仓库根目录）或 pnpm release（${packageDirectory} 目录）\n登录、版本号、发布标签和正式发布确认均在终端交互。\n发布后每 10 秒查询版本和下载地址，最多等待 10 分钟；超时显示待确认状态并正常退出。\n仅查询本地当前版本：${releaseCommand} --verify-only`);
        } else {
            const verifyOnly = args.length === 1 && args[0] === '--verify-only';
            if (args.length && !verifyOnly) throw new Error('不支持这些参数，请使用 --help 查看用法。');
            if (!verifyOnly && (!process.stdin.isTTY || !process.stdout.isTTY)) throw new Error('请在交互式终端运行发布脚本。');
            await publishPackage({cwd, expectedName, releaseCommand, verifyOnly});
        }
    } catch (error) {
        console.error(error.message);
        process.exitCode = error instanceof Cancelled ? error.exitCode : 1;
    }
}
