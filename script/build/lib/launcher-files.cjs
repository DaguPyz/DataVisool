/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
const fs = require('node:fs');
const path = require('node:path');

const LAUNCHER_FILES = Object.freeze([
    Object.freeze({name: 'deploy_windows.cmd', mode: 0o644}),
    Object.freeze({name: 'deploy_windows.ps1', mode: 0o644}),
    Object.freeze({name: 'deploy_linux.sh', mode: 0o755}),
    Object.freeze({name: 'deploy_macos.command', mode: 0o755}),
]);

function copyLauncherFiles(payloadDir) {
    const launcherDir = path.resolve(__dirname, '../launcher');
    fs.mkdirSync(payloadDir, {recursive: true});

    for (const {name, mode} of LAUNCHER_FILES) {
        const source = path.join(launcherDir, name);
        const destination = path.join(payloadDir, name);
        const sourceText = fs.readFileSync(source, 'utf8').replace(/\r\n|\r|\n/g, '\n');
        const windowsFile = name.endsWith('.cmd') || name.endsWith('.ps1');
        fs.writeFileSync(destination, windowsFile ? sourceText.replace(/\n/g, '\r\n') : sourceText);
        fs.chmodSync(destination, mode);
    }
}

module.exports = {copyLauncherFiles, LAUNCHER_FILES};
