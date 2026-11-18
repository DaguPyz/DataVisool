/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {publishPackage} from './publish.mjs';

const ok = (value = '') => ({code: 0, stdout: value, stderr: ''});
const failure = (code) => ({code: 1, stdout: JSON.stringify({error: {code}}), stderr: `npm error code ${code}`});

async function fixture(t, options = {}) {
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'datavisool-ui-publish-test-'));
    t.after(() => rm(cwd, {recursive: true, force: true}));
    const manifestPath = path.join(cwd, 'package.json');
    const name = options.name ?? '@datavisool/ui';
    await writeFile(manifestPath, JSON.stringify({
        name, version: options.version ?? '0.0.1', description: '保留用户字段',
    }));
    const commands = [];
    const prompts = [];
    const messages = [];
    const waits = [];
    const tarballCalls = [];
    const answers = [...(options.answers ?? ['', '', 'y'])];
    let loggedIn = !options.loggedOut;
    let verification = 0;
    let elapsed = 0;
    const execute = async (bin, args, config) => {
        commands.push({bin, args, ...config});
        assert.equal(config.cwd, cwd);
        assert.ok(args.includes('--registry=https://registry.npmjs.org/'));
        if (bin === 'npm' && args[0] === 'whoami') {
            assert.equal(config.capture, true);
            return loggedIn ? ok('A\n') : failure('ENEEDAUTH');
        }
        if (bin === 'npm' && args[0] === 'login') {
            assert.equal(config.capture, false);
            assert.ok(args.includes('--auth-type=legacy'));
            loggedIn = true;
            return options.loginResult ?? ok();
        }
        if (bin === 'npm' && args[0] === 'view' && args[2] === 'versions') {
            assert.equal(config.capture, true);
            return options.versionResult ?? ok(JSON.stringify(options.versions ?? []));
        }
        if (bin === 'npm' && args[0] === 'view' && args[2] === 'version') {
            const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
            assert.equal(args[1], `${name}@${manifest.version}`);
            assert.equal(args[3], 'dist.tarball');
            elapsed += options.queryDurationMs ?? 0;
            return options.verificationResults?.[verification++] ?? options.verificationResult ?? ok(JSON.stringify({
                version: manifest.version,
                'dist.tarball': `https://registry.npmjs.org/${name}/-/${name.split('/').at(-1)}-${manifest.version}.tgz`,
            }));
        }
        if (bin === 'pnpm' && args[0] === 'publish') {
            assert.equal(config.capture, false);
            assert.ok(args.includes('--no-git-checks'));
            assert.equal(args[args.indexOf('--access') + 1], 'public');
            return args.includes('--dry-run') ? options.previewResult ?? ok() : options.publishResult ?? ok();
        }
        throw new Error(`意外的命令：${bin} ${args.join(' ')}`);
    };
    const ask = async (text) => {
        prompts.push(text);
        assert.ok(answers.length, `未提供提示的回答：${text}`);
        if (options.beforeAnswer) await options.beforeAnswer(text, manifestPath);
        return answers.shift();
    };
    return {
        cwd, commands, prompts, messages, waits, tarballCalls,
        previewCalls: () => commands.filter((item) => item.bin === 'pnpm' && item.args.includes('--dry-run')),
        publishCalls: () => commands.filter((item) => item.bin === 'pnpm' && !item.args.includes('--dry-run')),
        manifest: async () => JSON.parse(await readFile(manifestPath, 'utf8')),
        run: () => publishPackage({
            cwd, execute, ask, log: (text) => messages.push(text), now: () => elapsed,
            wait: async (ms) => { waits.push(ms); elapsed += ms; },
            checkTarball: async (url, config) => {
                tarballCalls.push({url, ...config});
                assert.equal(config.method, 'HEAD');
                const result = options.tarballResults?.[tarballCalls.length - 1] ?? options.tarballResult ?? {status: 200};
                if (result instanceof Error) throw result;
                return result;
            },
            verificationTimeoutMs: options.timeoutMs ?? 30000,
            verifyOnly: options.verifyOnly ?? false,
            expectedName: options.expectedName,
            releaseCommand: options.releaseCommand,
        }),
    };
}

test('SDK 使用相同发布流程，并在待确认时提示 SDK 查询命令', async (t) => {
    const scenario = await fixture(t, {
        name: '@datavisool/sdk', expectedName: '@datavisool/sdk',
        releaseCommand: 'pnpm release:datavisool-sdk', verificationResult: failure('E404'),
    });
    const result = await scenario.run();
    assert.equal(result.name, '@datavisool/sdk');
    assert.equal(result.status, 'pending');
    assert.equal(scenario.previewCalls().length, 1);
    assert.equal(scenario.publishCalls().length, 1);
    assert.ok(scenario.messages.some((message) => message.includes('pnpm release:datavisool-sdk --verify-only')));
});

test('交互引擎使用相同发布流程，并提示对应的查询命令', async (t) => {
    const scenario = await fixture(t, {
        name: '@datavisool/interaction-engine', expectedName: '@datavisool/interaction-engine',
        releaseCommand: 'pnpm release:datavisool-interaction-engine', verificationResult: failure('E404'),
    });
    const result = await scenario.run();
    assert.equal(result.name, '@datavisool/interaction-engine');
    assert.equal(result.status, 'pending');
    assert.equal(scenario.previewCalls().length, 1);
    assert.equal(scenario.publishCalls().length, 1);
    assert.ok(scenario.messages.some((message) => message.includes('pnpm release:datavisool-interaction-engine --verify-only')));
});

test('目标包名不匹配时在执行任何命令前停止', async (t) => {
    const scenario = await fixture(t, {expectedName: '@datavisool/sdk'});
    await assert.rejects(scenario.run(), /包名不匹配/);
    assert.equal(scenario.commands.length, 0);
});

test('组织账号 A 首次发布：预演、明确确认、正式发布和指定版本验证', async (t) => {
    const scenario = await fixture(t, {versionResult: failure('E404')});
    const result = await scenario.run();
    assert.deepEqual(result, {name: '@datavisool/ui', version: '0.0.1', tag: 'latest', account: 'A', status: 'available'});
    assert.equal(scenario.previewCalls().length, 1);
    assert.equal(scenario.publishCalls().length, 1);
    assert.ok(scenario.prompts.at(-1).includes('确认正式发布'));
    assert.equal(scenario.commands.at(-1).args[1], '@datavisool/ui@0.0.1');
});

test('未登录时执行原生交互登录，并重新查询账号', async (t) => {
    const scenario = await fixture(t, {loggedOut: true, answers: ['y', '', '', 'yes']});
    await scenario.run();
    assert.equal(scenario.commands.filter((item) => item.args[0] === 'login').length, 1);
    assert.equal(scenario.commands.filter((item) => item.args[0] === 'whoami').length, 2);
});

test('拒绝登录时不查询版本、不构建、不发布', async (t) => {
    const scenario = await fixture(t, {loggedOut: true, answers: ['']});
    await assert.rejects(scenario.run(), {message: '已取消发布。', exitCode: 0});
    assert.equal(scenario.commands.length, 1);
});

test('登录失败时停止', async (t) => {
    const scenario = await fixture(t, {loggedOut: true, answers: ['yes'], loginResult: failure('E401')});
    await assert.rejects(scenario.run(), /npm 登录失败/);
    assert.equal(scenario.previewCalls().length, 0);
});

test('版本查询错误不会被视为首次发布', async (t) => {
    for (const code of ['ENOTFOUND', 'E401', 'E403']) {
        const scenario = await fixture(t, {versionResult: failure(code)});
        await assert.rejects(scenario.run(), /查询已发布版本失败/);
        assert.equal(scenario.prompts.length, 0);
        assert.equal(scenario.previewCalls().length, 0);
        assert.equal((await scenario.manifest()).version, '0.0.1');
    }
});

test('无效版本、重复版本和含 shell 字符的标签被拒绝，更新仅保留有效输入', async (t) => {
    const scenario = await fixture(t, {
        versions: ['0.0.1'], answers: ['', '0.0.01', '0.0.1', '0.0.2', 'bad;echo', 'latest', 'y'],
    });
    const result = await scenario.run();
    assert.equal(result.version, '0.0.2');
    assert.equal((await scenario.manifest()).description, '保留用户字段');
    assert.equal((await scenario.manifest()).version, '0.0.2');
    assert.ok(scenario.commands.every((item) => !item.args.includes('bad;echo')));
});

test('预发布版本默认使用 beta 标签', async (t) => {
    const scenario = await fixture(t, {answers: ['0.1.0-beta.1', '', 'y']});
    const result = await scenario.run();
    assert.equal(result.tag, 'beta');
    assert.equal(scenario.publishCalls()[0].args[3], '--tag');
    assert.equal(scenario.publishCalls()[0].args[4], 'beta');
});

test('预演失败时不会正式发布', async (t) => {
    const scenario = await fixture(t, {previewResult: failure('BUILD_FAILED'), answers: ['', '']});
    await assert.rejects(scenario.run(), /发布预演失败/);
    assert.equal(scenario.publishCalls().length, 0);
    assert.equal(scenario.prompts.length, 2);
});

test('发布确认默认取消，并保留选定的本地版本', async (t) => {
    const scenario = await fixture(t, {answers: ['0.0.2', '', '']});
    await assert.rejects(scenario.run(), {message: '已取消发布。'});
    assert.equal(scenario.previewCalls().length, 1);
    assert.equal(scenario.publishCalls().length, 0);
    assert.equal((await scenario.manifest()).version, '0.0.2');
});

test('预演后包名或版本变化时停止正式发布', async (t) => {
    const scenario = await fixture(t, {beforeAnswer: async (text, manifestPath) => {
        if (text.includes('确认正式发布')) {
            const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
            manifest.version = '0.0.9';
            await writeFile(manifestPath, JSON.stringify(manifest));
        }
    }});
    await assert.rejects(scenario.run(), /预演后发生变化/);
    assert.equal(scenario.publishCalls().length, 0);
});

test('正式发布失败后不查询结果、不重试发布', async (t) => {
    const scenario = await fixture(t, {publishResult: failure('E403')});
    await assert.rejects(scenario.run(), /正式发布失败/);
    assert.equal(scenario.publishCalls().length, 1);
    assert.equal(scenario.commands.at(-1).bin, 'pnpm');
});

test('超过原来的三次重试后版本才可见，仍能等待完成且只上传一次', async (t) => {
    const scenario = await fixture(t, {
        verificationResults: Array.from({length: 4}, () => failure('E404')), timeoutMs: 60000,
    });
    const result = await scenario.run();
    assert.equal(result.status, 'available');
    assert.deepEqual(scenario.waits, [10000, 10000, 10000, 10000]);
    assert.equal(scenario.publishCalls().length, 1);
    assert.ok(scenario.messages.some((text) => text.includes('已等待 30 秒')));
});

test('404 等待超时正常返回待确认状态，不将上传报告为失败', async (t) => {
    const scenario = await fixture(t, {verificationResult: failure('E404')});
    const result = await scenario.run();
    assert.equal(result.status, 'pending');
    assert.equal(scenario.publishCalls().length, 1);
    assert.deepEqual(scenario.waits, [10000, 10000, 10000]);
    assert.ok(scenario.messages.some((text) => text.includes('上传命令已完成') && text.includes('尚未确认可安装')));
    assert.ok(scenario.messages.some((text) => text.includes('--verify-only')));
    assert.ok(scenario.messages.every((text) => !text.includes('发布完成，')));
});

test('版本已可见而下载地址仍是 404 时继续等待下载地址', async (t) => {
    const scenario = await fixture(t, {tarballResults: [{status: 404}, {status: 200}]});
    const result = await scenario.run();
    assert.equal(result.status, 'available');
    assert.equal(scenario.tarballCalls.length, 2);
    assert.deepEqual(scenario.waits, [10000]);
    assert.ok(scenario.messages.some((text) => text.includes('版本信息已可见，下载地址暂不可用')));
});

test('版本已可见但尚未返回下载地址时继续等待', async (t) => {
    const scenario = await fixture(t, {verificationResults: [ok('"0.0.1"')]});
    const result = await scenario.run();
    assert.equal(result.status, 'available');
    assert.equal(scenario.tarballCalls.length, 1);
    assert.deepEqual(scenario.waits, [10000]);
    assert.ok(scenario.messages.some((text) => text.includes('下载地址尚未提供')));
});

test('下载地址请求超时后恢复，期间明确显示下载地址查询失败', async (t) => {
    const scenario = await fixture(t, {tarballResults: [new Error('request timed out'), {status: 200}]});
    const result = await scenario.run();
    assert.equal(result.status, 'available');
    assert.deepEqual(scenario.waits, [10000]);
    assert.ok(scenario.messages.some((text) => text.includes('下载地址查询失败：request timed out')));
});

test('下载地址权限异常时正常返回无法确认状态', async (t) => {
    const scenario = await fixture(t, {tarballResult: {status: 403}});
    const result = await scenario.run();
    assert.equal(result.status, 'unverified');
    assert.ok(scenario.messages.some((text) => text.includes('HTTP 403')));
    assert.equal(scenario.waits.length, 0);
});

test('网络异常可恢复，恢复之前不会声称 npm 正在处理', async (t) => {
    const scenario = await fixture(t, {verificationResults: [failure('ENOTFOUND')]});
    const result = await scenario.run();
    assert.equal(result.status, 'available');
    assert.ok(scenario.messages.some((text) => text.includes('查询暂不可用（ENOTFOUND）')));
    assert.ok(scenario.messages.every((text) => !text.includes('npm 可能仍在处理')));
    assert.equal(scenario.publishCalls().length, 1);
});

test('持续网络异常超时显示无法确认状态', async (t) => {
    const scenario = await fixture(t, {verificationResult: failure('ETIMEDOUT')});
    const result = await scenario.run();
    assert.equal(result.status, 'unverified');
    assert.ok(scenario.messages.some((text) => text.includes('ETIMEDOUT') && text.includes('尚未确认可安装')));
    assert.equal(scenario.publishCalls().length, 1);
});

test('上传后的查询权限异常直接提示，不重复上传、不抛发布失败', async (t) => {
    const scenario = await fixture(t, {verificationResult: failure('E403')});
    const result = await scenario.run();
    assert.equal(result.status, 'unverified');
    assert.ok(scenario.messages.some((text) => text.includes('查询权限异常（E403）')));
    assert.equal(scenario.waits.length, 0);
    assert.equal(scenario.publishCalls().length, 1);
});

test('无效查询数据正常返回无法确认状态', async (t) => {
    for (const value of ['invalid-json', JSON.stringify({version: '0.0.9'})]) {
        const scenario = await fixture(t, {verificationResult: ok(value)});
        const result = await scenario.run();
        assert.equal(result.status, 'unverified');
        assert.equal(scenario.publishCalls().length, 1);
        assert.equal(scenario.tarballCalls.length, 0);
    }
});

test('查询耗时计入超时预算，剩余等待时间不超过截止时间', async (t) => {
    const scenario = await fixture(t, {verificationResult: failure('E404'), queryDurationMs: 8000, timeoutMs: 25000});
    const result = await scenario.run();
    assert.equal(result.status, 'pending');
    assert.deepEqual(scenario.waits, [10000]);
    const queries = scenario.commands.filter((item) => item.args[2] === 'version');
    assert.equal(queries.length, 2);
    assert.ok(queries[1].args.includes('--fetch-timeout=7000'));
});

test('仅查询模式不检查登录、不修改版本、不执行构建或发布', async (t) => {
    const scenario = await fixture(t, {verifyOnly: true, answers: []});
    const result = await scenario.run();
    assert.equal(result.status, 'available');
    assert.equal(result.version, '0.0.1');
    assert.equal(scenario.prompts.length, 0);
    assert.equal(scenario.publishCalls().length, 0);
    assert.equal(scenario.previewCalls().length, 0);
    assert.ok(scenario.commands.every((item) => item.bin === 'npm' && item.args[0] === 'view'));
    assert.equal((await scenario.manifest()).version, '0.0.1');
    assert.ok(scenario.messages.every((text) => !text.includes('上传命令已完成')));
});

test('仅查询模式暂不可见时不会声称已上传', async (t) => {
    const scenario = await fixture(t, {verifyOnly: true, answers: [], verificationResult: failure('E404')});
    const result = await scenario.run();
    assert.equal(result.status, 'pending');
    assert.ok(scenario.messages.every((text) => !text.includes('上传命令已完成')));
});

test('仅查询 CLI 允许非交互终端，查询异常正常退出', {skip: process.platform === 'win32'}, async (t) => {
    const scenario = await fixture(t);
    const bin = path.join(scenario.cwd, 'bin');
    await mkdir(bin);
    await writeFile(path.join(bin, 'npm'), '#!/bin/sh\nprintf \'%s\\n\' \'{"error":{"code":"E403"}}\'\nexit 1\n', {mode: 0o755});
    const script = fileURLToPath(new URL('./publish.mjs', import.meta.url));
    const result = spawnSync(process.execPath, [script, '--verify-only'], {
        encoding: 'utf8', input: '', env: {...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`},
    });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /查询权限异常（E403）/);
    assert.equal(result.stderr, '');
});

test('非交互式终端在执行 npm 命令前退出', () => {
    const script = fileURLToPath(new URL('./publish.mjs', import.meta.url));
    const result = spawnSync(process.execPath, [script], {encoding: 'utf8', input: ''});
    assert.equal(result.status, 1);
    assert.match(result.stderr, /请在交互式终端运行/);
});

test('SDK 入口帮助和非交互查询指向 SDK 包及命令', {skip: process.platform === 'win32'}, async (t) => {
    const scenario = await fixture(t);
    const bin = path.join(scenario.cwd, 'bin');
    await mkdir(bin);
    await writeFile(path.join(bin, 'npm'), '#!/bin/sh\ncase "$2" in @datavisool/sdk@*) ;; *) exit 2 ;; esac\nprintf \'%s\\n\' \'{"error":{"code":"E403"}}\'\nexit 1\n', {mode: 0o755});
    const script = fileURLToPath(new URL('../../datavisool-sdk/scripts/publish.mjs', import.meta.url));
    const help = spawnSync(process.execPath, [script, '--help'], {encoding: 'utf8'});
    assert.equal(help.status, 0);
    assert.match(help.stdout, /pnpm release:datavisool-sdk --verify-only/);
    const query = spawnSync(process.execPath, [script, '--verify-only'], {
        encoding: 'utf8', input: '', env: {...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`},
    });
    assert.equal(query.status, 0);
    assert.match(query.stdout, /@datavisool\/sdk@/);
    assert.match(query.stdout, /查询权限异常（E403）/);
    assert.equal(query.stderr, '');
});

test('交互引擎入口的非交互查询使用正确包名', {skip: process.platform === 'win32'}, async (t) => {
    const scenario = await fixture(t);
    const bin = path.join(scenario.cwd, 'bin');
    await mkdir(bin);
    await writeFile(path.join(bin, 'npm'), '#!/bin/sh\ncase "$2" in @datavisool/interaction-engine@*) ;; *) exit 2 ;; esac\nprintf \'%s\\n\' \'{"error":{"code":"E403"}}\'\nexit 1\n', {mode: 0o755});
    const script = fileURLToPath(new URL('../../datavisool-interaction-engine/scripts/publish.mjs', import.meta.url));
    const query = spawnSync(process.execPath, [script, '--verify-only'], {
        encoding: 'utf8', input: '', env: {...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`},
    });
    assert.equal(query.status, 0);
    assert.match(query.stdout, /@datavisool\/interaction-engine@/);
    assert.match(query.stdout, /查询权限异常（E403）/);
    assert.equal(query.stderr, '');
});
