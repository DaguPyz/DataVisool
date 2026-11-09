#!/usr/bin/env python3
# Licensed under the DataVisool License. See the LICENSE file distributed with this software.
"""Collect license metadata and packaged notices from locally resolved runtime dependencies.

Uses pnpm's production dependency graph and Maven's offline runtime dependency tree.
This inventory is a review aid, not a determination of redistribution rights.
"""
from __future__ import annotations
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[2]
M2 = Path(os.environ.get('DATAVISOOL_MAVEN_REPOSITORY', Path.home() / '.m2/repository'))
LICENSE_NAME = re.compile(r'(?i)^(?:license|licence|notice|copying)(?:[._-].*)?$')
MAVEN_NODE = re.compile(r'([\w.\-]+):([\w.\-]+):([^: ]+):([^: ]+):(compile|runtime)\b')
NS = {'m': 'http://maven.apache.org/POM/4.0.0'}
README_LICENSE_PACKAGES = {('is-mobile', '5.0.0'), ('murmurhash-js', '1.0.0')}


def run(args, cwd):
    return subprocess.check_output(args, cwd=cwd, text=True, stderr=subprocess.PIPE)


def license_file_name(name):
    return bool(LICENSE_NAME.match(Path(name).name))


def collect_text(raw, source, texts):
    if len(raw) > 1024 * 1024:
        return {'source': source, 'error': 'file exceeds 1 MiB'}
    try:
        content = raw.decode('utf-8-sig').replace('\r\n', '\n')
    except UnicodeError:
        return {'source': source, 'error': 'not UTF-8 text'}
    digest = hashlib.sha256(content.encode()).hexdigest()
    texts.setdefault(digest, content)
    return {'source': source, 'sha256': digest}


def get_npm(texts, upstream):
    graph = json.loads(run(['pnpm', '--filter', 'datavisool-app', 'list', '--prod', '--depth', 'Infinity', '--json'], ROOT))[0]
    found = {}
    def visit(dependencies):
        for alias, node in dependencies.items():
            name, version, location = node.get('from', alias), node.get('version'), node.get('path')
            if location and version:
                found[(name, version)] = Path(location)
            visit(node.get('dependencies', {}))
    visit(graph.get('dependencies', {}))
    result = []
    for (name, version), directory in sorted(found.items()):
        metadata = json.loads((directory / 'package.json').read_text(encoding='utf-8'))
        sources = []
        for item in sorted(directory.iterdir()):
            if item.is_file() and license_file_name(item.name):
                sources.append(collect_text(item.read_bytes(), item.name, texts))
        if (name, version) in README_LICENSE_PACKAGES:
            readme = (directory / 'README.md').read_text(encoding='utf-8')
            match = re.search(r'(?ims)^## License[^\n]*\n(.*?)(?=^## |\Z)', readme)
            if not match or 'Permission is hereby granted' not in match.group(1) or 'SOFTWARE' not in match.group(1):
                raise ValueError(f'Cannot locate the complete README license: {name}@{version}')
            sources.append(collect_text(match.group(0).encode('utf-8'), 'README.md#License', texts))
        bundled = directory / 'licenses'
        if bundled.is_dir():
            for item in sorted(bundled.rglob('*')):
                if item.is_file() and not item.is_symlink() and license_file_name(item.name):
                    sources.append(collect_text(item.read_bytes(), item.relative_to(directory).as_posix(), texts))
        for pinned in upstream.get((name, version), []):
            source = ROOT / 'third-party/upstream-licenses' / pinned['file']
            raw = source.read_bytes()
            if hashlib.sha256(raw).hexdigest() != pinned['sha256']:
                raise ValueError(f'Pinned upstream license hash mismatch: {name}@{version}')
            sources.append(collect_text(raw, pinned['source'], texts))
        repo = metadata.get('repository')
        if isinstance(repo, dict): repo = repo.get('url')
        result.append({'package': name, 'version': version,
                       'license': metadata.get('license', metadata.get('licenses')),
                       'repository': repo, 'notices': sources,
                       'needs_review': not metadata.get('license', metadata.get('licenses')) or not any(n.get('sha256') for n in sources)})
    return result


def read_pom_licenses(pom, visited=None):
    visited = visited or set()
    if not pom.is_file() or pom in visited: return []
    visited.add(pom)
    try: root = ET.parse(pom).getroot()
    except ET.ParseError: return []
    licenses = [{'name': l.findtext('m:name', default='', namespaces=NS).strip(),
                 'url': l.findtext('m:url', default='', namespaces=NS).strip()}
                for l in root.findall('./m:licenses/m:license', NS)]
    if licenses: return licenses
    parent = root.find('m:parent', NS)
    if parent is None: return []
    group = parent.findtext('m:groupId', default='', namespaces=NS)
    artifact = parent.findtext('m:artifactId', default='', namespaces=NS)
    version = parent.findtext('m:version', default='', namespaces=NS)
    if not group or not artifact or not version or '${' in version: return []
    parent_pom = M2.joinpath(*group.split('.'), artifact, version, f'{artifact}-{version}.pom')
    return read_pom_licenses(parent_pom, visited)


def get_maven(texts):
    with tempfile.TemporaryDirectory(prefix='datavisool-license-audit-') as temp:
        tree = Path(temp) / 'runtime-tree.txt'
        run(['mvn', '-o', '-q', '-pl', 'datavisool-service', '-am', 'dependency:tree', '-Dscope=runtime', f'-DoutputFile={tree}'], ROOT / 'datavisool-server')
        lines = tree.read_text(encoding='utf-8').splitlines()
    found = {}
    for line in lines[1:]:
        match = MAVEN_NODE.search(line)
        if not match: continue
        group, artifact, extension, version, scope = match.groups()
        found[(group, artifact, version)] = (extension, scope)
    result = []
    for (group, artifact, version), (extension, scope) in sorted(found.items()):
        directory = M2.joinpath(*group.split('.'), artifact, version)
        pom = directory / f'{artifact}-{version}.pom'
        licenses = read_pom_licenses(pom)
        internal = group == 'com.zsq' and artifact == 'datavisool-common'
        notices = []
        if (group, artifact, version) == ('com.oracle.database.jdbc', 'ojdbc8', '19.3.0.0'):
            pom_root = ET.parse(pom).getroot()
            license_text = pom_root.findtext('./m:licenses/m:license/m:comments', default='', namespaces=NS).strip()
            if len(license_text) < 1000 or 'Oracle Free Use Terms and Conditions' not in license_text:
                raise ValueError('Oracle JDBC POM license text is missing or incomplete')
            notices.append(collect_text(license_text.encode('utf-8'), 'POM licenses/license/comments', texts))
        archive = directory / f'{artifact}-{version}.{extension}'
        if archive.is_file() and zipfile.is_zipfile(archive):
            with zipfile.ZipFile(archive) as z:
                for item in sorted(z.namelist()):
                    if not item.endswith('/') and license_file_name(item):
                        notices.append(collect_text(z.read(item), item, texts))
        if internal:
            licenses = [{'name': 'DataVisool License 1.0', 'url': ''}]
            notices.append(collect_text((ROOT / 'LICENSE').read_bytes(), 'project LICENSE', texts))
        result.append({'package': f'{group}:{artifact}', 'version': version, 'scope': scope,
                       'licenses': licenses, 'notices': notices,
                       'needs_review': not licenses or not any(n.get('sha256') for n in notices)})
    return result


def main():
    texts = {}
    pinned = json.loads((ROOT / 'third-party/pinned-sources.json').read_text(encoding='utf-8'))
    upstream = {}
    for item in pinned:
        upstream.setdefault((item['package'], item['version']), []).append(item)
    npm = get_npm(texts, upstream)
    maven = get_maven(texts)
    icon_path = ROOT / 'datavisool-app/src/pages/home/ai-model-management/assets/providers/LICENSE'
    icon_notice = collect_text(icon_path.read_bytes(), 'Lobe Icons LICENSE', texts)
    inputs = ['pnpm-lock.yaml', 'datavisool-app/package.json', 'datavisool-server/pom.xml',
              'datavisool-server/datavisool-service/pom.xml', 'third-party/pinned-sources.json']
    data = {'description': 'Runtime dependency metadata collected from local packages; not a legal assessment.',
            'input_sha256': {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in inputs},
            'npm': npm, 'maven': maven,
            'assets': [{'package': '@lobehub/icons-static-svg', 'version': '1.90.0', 'notices': [icon_notice]}]}
    audit_dir = ROOT / 'third-party'
    audit_dir.mkdir(exist_ok=True)
    (audit_dir / 'dependency-inventory.json').write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    out = ['DataVisool Web — Third-party notices (inventory, pending review)',
           'This file collects locally available notices. Missing texts and permissions require review; it is not a compliance certification.',
           '', 'I. Dependency and asset index', '']
    for section, items in [('npm', npm), ('Maven', maven), ('Assets', data['assets'])]:
        out.append(f'--- {section} ---')
        for item in items:
            label = item['package'] + '@' + item['version']
            license_value = item.get('license', item.get('licenses', 'MIT (see asset notice)'))
            sources = ', '.join(n.get('sha256', 'UNREADABLE') for n in item['notices']) or 'MISSING LOCAL LICENSE/NOTICE TEXT'
            out.append(f'{label} | license metadata: {json.dumps(license_value, ensure_ascii=False)} | notice SHA256: {sources}')
        out.append('')
    out.extend(['II. Notice and license texts', 'The SHA256 references above identify the following locally collected texts.', ''])
    for digest, content in sorted(texts.items()):
        out.extend([f'===== {digest} =====', content.rstrip(), ''])
    (ROOT / 'THIRD_PARTY_NOTICES.txt').write_text('\n'.join(out), encoding='utf-8')
    print(f'npm={len(npm)} (需核实 {sum(i["needs_review"] for i in npm)}), Maven={len(maven)} (需核实 {sum(i["needs_review"] for i in maven)}), 独立文本={len(texts)}')

if __name__ == '__main__':
    main()
