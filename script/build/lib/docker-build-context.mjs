/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { prepareDockerArtifacts, validatePreparedDockerArtifacts } from './docker-artifacts.mjs';

function makeReadable(directory) {
  fs.chmodSync(directory, 0o755);
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const child = path.join(directory, entry.name);
    if (entry.isDirectory()) makeReadable(child);
    else if (entry.isFile()) fs.chmodSync(child, 0o644);
    else throw new Error(`Docker 组件文档必须是普通文件或目录：${child}`);
  }
}

// Only validated outputs and explicitly selected runtime files reach Docker.
// Variants never modify the shared artifacts directory.
export function createDockerBuildContext({ artifactDir, jarPath, componentDocsDir, assets = {} }) {
  let prepared;
  let contextDir;
  try {
    if (artifactDir) {
      artifactDir = path.resolve(artifactDir);
      validatePreparedDockerArtifacts(artifactDir);
    } else {
      prepared = prepareDockerArtifacts({ jarPath, componentDocsDir });
      artifactDir = prepared.contextDir;
    }
    contextDir = fs.mkdtempSync(path.join(os.tmpdir(), 'datavisool-docker-context-'));
    fs.copyFileSync(path.join(artifactDir, 'server.jar'), path.join(contextDir, 'server.jar'));
    fs.chmodSync(path.join(contextDir, 'server.jar'), 0o644);
    fs.cpSync(path.join(artifactDir, 'component-docs'), path.join(contextDir, 'component-docs'), {
      recursive: true, errorOnExist: true, force: false,
    });
    makeReadable(path.join(contextDir, 'component-docs'));
    for (const [name, source] of Object.entries(assets)) {
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) || ['server.jar', 'component-docs'].includes(name)) {
        throw new Error(`Docker 运行文件目标名称无效：${name}`);
      }
      if (!fs.lstatSync(source).isFile()) throw new Error(`Docker 运行文件必须是普通文件：${source}`);
      fs.copyFileSync(source, path.join(contextDir, name), fs.constants.COPYFILE_EXCL);
      fs.chmodSync(path.join(contextDir, name), 0o644);
    }
    const ownedContext = contextDir;
    return {
      contextDir,
      cleanup() {
        try { fs.rmSync(ownedContext, { recursive: true, force: true }); }
        finally { prepared?.cleanup(); }
      },
    };
  } catch (error) {
    try { if (contextDir) fs.rmSync(contextDir, { recursive: true, force: true }); }
    finally { prepared?.cleanup(); }
    throw error;
  }
}
