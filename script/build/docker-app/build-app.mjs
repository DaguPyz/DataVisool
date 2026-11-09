/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dockerPlatform, main, parseArgs, requireDocker, run, validateImage } from '../lib/common.mjs';
import { createDockerBuildContext } from '../lib/docker-build-context.mjs';
import { renderDeploymentDoc } from '../lib/release-docs.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { copyLauncherFiles } = require('../lib/launcher-files.cjs');
const HELP = `用法：node script/build/docker-app/build-app.mjs [选项]
  --version VERSION       镜像标签，默认 package.json 版本；不修改源码版本
  --image-name NAME       默认 datavisool-web，可使用镜像仓库路径
  --platform PLATFORM     仅构建 linux/amd64 或 linux/arm64；默认两种都构建
  --output-dir DIR        发布包目录，默认 script/build/release
  --jar PATH              复用指定的后端 JAR，默认 datavisool-server/datavisool-service/target/server.jar
  --component-docs DIR    复用指定的 component-docs，默认 datavisool-server/datavisool-service/target/component-docs
  --artifact-dir DIR      使用统一构建准备好的共享产物目录；不能与 --jar/--component-docs 并用
  --skip-export           只构建并加载镜像，不生成发布压缩包
  --no-cache              不使用镜像构建缓存
宿主机需要 Node.js 20+、Docker/buildx；导出发布包另需 tar。
Docker 构建复用常规构建生成的 JAR 和 component-docs，不再运行 Node、pnpm 或 Maven。`;

export function build(args, { execute = run, scriptDir = SCRIPT_DIR, log = console.log } = {}) {
  const buildDir = path.resolve(scriptDir, '..');
  const repoDir = path.resolve(scriptDir, '../../..');
  const options = parseArgs(args, {
    version: '', 'image-name': 'datavisool-web', platform: '',
    'output-dir': path.join(buildDir, 'release'), jar: '', 'component-docs': '', 'artifact-dir': '',
    'skip-export': false, 'no-cache': false,
  }, ['skip-export', 'no-cache']);
  if (options.help) { log(HELP); return; }
  if (options['artifact-dir'] && (options.jar || options['component-docs'])) {
    throw new Error('--artifact-dir 不能与 --jar 或 --component-docs 并用');
  }
  const version = options.version || JSON.parse(fs.readFileSync(path.join(repoDir, 'package.json'), 'utf8')).version;
  if (!/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/.test(version)) throw new Error('版本号不能作为 Docker 标签使用');
  const imageAlias = `${options['image-name']}:${version}`;
  validateImage(imageAlias);
  const platforms = options.platform ? [options.platform] : ['linux/amd64', 'linux/arm64'];
  if (platforms.some(platform => !['linux/amd64', 'linux/arm64'].includes(platform))) throw new Error('仅支持 linux/amd64 或 linux/arm64');
  const outputDir = path.resolve(options['output-dir']);
  const targets = platforms.map(platform => {
    const image = `${imageAlias}-${platform.split('/')[1]}`;
    validateImage(image);
    const bundleName = `datavisool-web-app-${version}-${platform.replace('/', '-')}`;
    return { platform, image, bundleName, archive: path.join(outputDir, `${bundleName}.tar.gz`) };
  });
  if (!options['skip-export']) {
    for (const { archive } of targets) {
      if (fs.existsSync(archive)) throw new Error(`发布包已存在，请更换版本或输出目录：${archive}`);
    }
    const template = fs.readFileSync(path.join(scriptDir, 'DEPLOYMENT.md'), 'utf8');
    for (const target of targets) target.deploymentDoc = renderDeploymentDoc(template, { version, ...target });
    execute('tar', ['--version'], { capture: true });
  }

  const context = createDockerBuildContext({
    artifactDir: options['artifact-dir'] || undefined,
    jarPath: options.jar || path.join(repoDir, 'datavisool-server/datavisool-service/target/server.jar'),
    componentDocsDir: options['component-docs'] || path.join(repoDir, 'datavisool-server/datavisool-service/target/component-docs'),
    assets: {
      'LICENSE': path.join(repoDir, 'LICENSE'),
      'THIRD_PARTY_NOTICES.txt': path.join(repoDir, 'THIRD_PARTY_NOTICES.txt'),
      'entrypoint.sh': path.join(scriptDir, 'entrypoint.sh'),
      'healthcheck.sh': path.join(scriptDir, 'healthcheck.sh'),
    },
  });
  try {
    requireDocker(execute);
    execute('docker', ['buildx', 'version'], { capture: true });
    // Preserve the existing local tag while keeping both architectures addressable.
    const aliasPlatform = platforms.length === 1 ? platforms[0] : dockerPlatform(execute);
    for (const { platform, image, bundleName, archive, deploymentDoc } of targets) {
      log(`构建应用镜像：${image} (${platform})`);
      execute('docker', ['buildx', 'build', '--platform', platform, '--load', '--tag', image,
        ...(platform === aliasPlatform ? ['--tag', imageAlias] : []),
        '--build-arg', `APP_VERSION=${version}`, '--file', path.join(scriptDir, 'Dockerfile'),
        ...(options['no-cache'] ? ['--no-cache'] : []), context.contextDir]);
      if (options['skip-export']) continue;

      fs.mkdirSync(outputDir, { recursive: true });
      const temporary = fs.mkdtempSync(path.join(outputDir, '.bundle-'));
      try {
        const payload = path.join(temporary, bundleName);
        fs.mkdirSync(payload, { recursive: true });
        for (const name of ['LICENSE', 'THIRD_PARTY_NOTICES.txt']) fs.copyFileSync(path.join(repoDir, name), path.join(payload, name));
        for (const file of ['docker-app/docker-compose.yml', 'docker-app/.env.example']) {
          fs.mkdirSync(path.dirname(path.join(payload, file)), { recursive: true });
          fs.copyFileSync(path.join(buildDir, file), path.join(payload, file));
        }
        const shellLauncher = path.join(payload, 'docker-app/launch.sh');
        const shellSource = fs.readFileSync(path.join(scriptDir, 'launch.sh'), 'utf8')
          .replace(/\r\n|\r/g, '\n');
        fs.writeFileSync(shellLauncher, shellSource, { mode: 0o755 });
        fs.chmodSync(shellLauncher, 0o755);

        const powershellLauncher = path.join(payload, 'docker-app/launch.ps1');
        const powershellSource = fs.readFileSync(path.join(scriptDir, 'launch.ps1'), 'utf8')
          .replace(/^\uFEFF/, '').replace(/\r\n|\r|\n/g, '\n');
        fs.writeFileSync(powershellLauncher, `\uFEFF${powershellSource.replace(/\n/g, '\r\n')}`, { encoding: 'utf8', mode: 0o644 });
        fs.chmodSync(powershellLauncher, 0o644);

        // Include the established four platform entry points at the package root.
        copyLauncherFiles(payload);
        fs.mkdirSync(path.join(payload, 'config'), { recursive: true });
        fs.copyFileSync(path.join(scriptDir, 'config/application.yml'), path.join(payload, 'config/application.yml'));
        fs.writeFileSync(path.join(payload, '部署说明.md'), deploymentDoc);
        for (const [name, value] of Object.entries({ IMAGE: image, VERSION: version, PLATFORM: platform })) {
          fs.writeFileSync(path.join(payload, 'docker-app', name), `${value}\n`);
        }
        execute('docker', ['image', 'save', '--output', path.join(payload, 'image.tar'), image]);
        const packed = path.join(temporary, 'package.tar.gz');
        execute('tar', ['-czf', packed, '-C', temporary, bundleName]);
        // Both paths share a filesystem: publish the complete archive in one step,
        // refusing to replace an archive created by another build.
        try {
          fs.linkSync(packed, archive);
        } catch (error) {
          if (error.code === 'EEXIST') throw new Error(`发布包已存在，未覆盖：${archive}`);
          throw new Error(`无法原子发布压缩包；输出目录需要位于支持硬链接的文件系统：${error.message}`);
        }
        log(`发布包：${archive}\n解压后按包内的 部署说明.md 导入镜像并部署。`);
      } finally {
        fs.rmSync(temporary, { recursive: true, force: true });
      }
    }
  } finally {
    context.cleanup();
  }
}

main(import.meta.url, build);
