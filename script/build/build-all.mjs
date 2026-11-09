/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { main, parseArgs, run } from './lib/common.mjs';
import { prepareDockerArtifacts } from './lib/docker-artifacts.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const HELP = `用法：node script/build/build-all.mjs [选项]
依次构建常规部署 ZIP、Docker app 的 amd64/arm64 发布包、Docker allinone 的 amd64/arm64 发布包。
版本统一读取 package.json；常规部署只构建打包，不上传服务器。
前后端只在常规步骤编译一次，Docker app 和 Docker allinone 复用同次 JAR 和组件文档。
  --target-jdk PATH       常规构建使用的 JDK 17，默认沿用其环境配置
  --maven-home PATH       常规构建使用的 Maven 目录
  --mvn-command COMMAND   常规构建使用的 Maven 命令
  --no-cache              Docker 构建不使用缓存
  --dry-run               只显示执行计划，不执行构建
五份发布包统一输出到 script/build/release。
需要本机常规构建环境，以及支持 amd64、arm64 的 Docker Linux 引擎和 Buildx。`;

export function buildAll(args, { execute = run, scriptDir = SCRIPT_DIR, env = process.env,
  log = console.log } = {}) {
  const options = parseArgs(args, {
    'target-jdk': '', 'maven-home': '', 'mvn-command': '', 'no-cache': false, 'dry-run': false,
  }, ['no-cache', 'dry-run']);
  if (options.help) { log(HELP); return; }

  const repoRoot = path.resolve(scriptDir, '../..');
  const version = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')).version;
  if (typeof version !== 'string' || !/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/.test(version)) {
    throw new Error('package.json 中的版本号不能作为发布版本使用');
  }

  // Explicit CLI values prevent environment flags from skipping the build
  // or selecting a different JAR.
  const nativeArgs = [path.join(scriptDir, 'native/deploy.js'),
    '--skip-build=false', '--dry-run=false', '--local-jar',
    path.join(repoRoot, 'datavisool-server/datavisool-service/target/server.jar'),
    '--output-dir', path.join(scriptDir, 'release')];
  for (const key of ['target-jdk', 'maven-home']) {
    if (options[key]) nativeArgs.push(`--${key}`, path.resolve(options[key]));
  }
  if (options['mvn-command']) nativeArgs.push('--mvn-command', options['mvn-command']);

  const releaseDir = path.join(scriptDir, 'release');
  const steps = [{
    name: '常规部署 ZIP', args: nativeArgs,
    artifacts: [path.join(releaseDir, `datavisool-web-v${version}-release.zip`)],
  }];
  for (const [variant, prefix, name] of [
    ['app', 'datavisool-web-app', 'Docker app（amd64 + arm64）'],
    ['allinone', 'datavisool-web-allinone', 'Docker allinone（amd64 + arm64）'],
  ]) {
    steps.push({
      name,
      args: [path.join(scriptDir, `docker-${variant}/build-${variant}.mjs`), '--version', version,
        ...(options['no-cache'] ? ['--no-cache'] : [])],
      artifacts: ['amd64', 'arm64'].map(architecture =>
        path.join(releaseDir, `${prefix}-${version}-linux-${architecture}.tar.gz`)),
    });
  }

  if (options['dry-run']) {
    log(`构建计划（版本 ${version}，共 5 份发布包）：`);
    for (const [index, step] of steps.entries()) {
      const args = index === 0 ? step.args : [...step.args, '--artifact-dir', '<同次常规构建整理的共享产物目录>'];
      log(`[${index + 1}/${steps.length}] ${step.name}\n  ${[process.execPath, ...args].map(value => JSON.stringify(value)).join(' ')}\n  输出：${step.artifacts.join('\n        ')}`);
    }
    return;
  }

  // Check all five outputs before any build starts, so a partial old release cannot be mistaken for a fresh build.
  for (const artifact of steps.flatMap(step => step.artifacts)) {
    if (fs.existsSync(artifact)) throw new Error(`发布包已存在，请先移走已有发布包再构建：${artifact}`);
  }

  let sharedArtifacts;
  try {
    for (const [index, step] of steps.entries()) {
      log(`[${index + 1}/${steps.length}] ${step.name}`);
      try {
        if (index > 0 && !sharedArtifacts) {
          const targetDir = path.join(repoRoot, 'datavisool-server/datavisool-service/target');
          sharedArtifacts = prepareDockerArtifacts({
            jarPath: path.join(targetDir, 'server.jar'),
            componentDocsDir: path.join(targetDir, 'component-docs'),
          });
          log('Docker app 和 Docker allinone 将复用同次构建的 JAR 和组件文档，不再编译前后端。');
        }
        const args = index === 0 ? step.args : [...step.args, '--artifact-dir', sharedArtifacts.contextDir];
        execute(process.execPath, args, { cwd: repoRoot, env: { ...env } });
        for (const artifact of step.artifacts) {
          if (!fs.existsSync(artifact) || !fs.statSync(artifact).isFile() || fs.statSync(artifact).size === 0) {
            throw new Error(`未生成有效发布包：${artifact}`);
          }
        }
      } catch (error) {
        throw new Error(`${step.name} 构建失败，已停止后续步骤；已生成的产物保留。\n${error.message}`);
      }
    }
  } finally {
    sharedArtifacts?.cleanup();
  }

  log(`全部构建完成（5 份发布包）：\n${steps.flatMap(step => step.artifacts).join('\n')}`);
}

main(import.meta.url, buildAll);
