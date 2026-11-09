/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderDeploymentDoc } from '../lib/release-docs.mjs';

const template = [
  '# {{VERSION}}',
  'Platform: {{PLATFORM}}',
  'Architecture: {{ARCHITECTURE}}',
  'Archive suffix: {{ARCH}}',
  'Image: {{IMAGE}}',
].join('\n');

test('deployment document renders amd64 metadata as x86_64', () => {
  const rendered = renderDeploymentDoc(template, {
    version: '3.2.1', platform: 'linux/amd64', image: 'registry.example/datavisool-web:3.2.1-amd64',
  });
  assert.equal(rendered, [
    '# 3.2.1',
    'Platform: linux/amd64',
    'Architecture: x86_64（amd64）',
    'Archive suffix: amd64',
    'Image: registry.example/datavisool-web:3.2.1-amd64',
  ].join('\n'));
  assert.doesNotMatch(rendered, /\{\{[^}]+\}\}/);
});

test('deployment document renders arm64 metadata as ARM64', () => {
  const rendered = renderDeploymentDoc(template, {
    version: '3.2.1', platform: 'linux/arm64', image: 'registry.example/datavisool-web-allinone:3.2.1-arm64',
  });
  assert.equal(rendered, [
    '# 3.2.1',
    'Platform: linux/arm64',
    'Architecture: ARM64（arm64）',
    'Archive suffix: arm64',
    'Image: registry.example/datavisool-web-allinone:3.2.1-arm64',
  ].join('\n'));
  assert.doesNotMatch(rendered, /\{\{[^}]+\}\}/);
});

test('deployment document rejects unknown placeholders and unsupported platforms', () => {
  assert.throws(() => renderDeploymentDoc(`${template}\nUnknown: {{UNKNOWN}}`, {
    version: '3.2.1', platform: 'linux/amd64', image: 'datavisool-web:3.2.1-amd64',
  }), /占位符|placeholder/i);
  assert.throws(() => renderDeploymentDoc(template, {
    version: '3.2.1', platform: 'linux/386', image: 'datavisool-web:3.2.1-386',
  }), /platform|架构|支持/i);
});
