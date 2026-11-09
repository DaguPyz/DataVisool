/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
const ARCHITECTURES = {
  'linux/amd64': 'x86_64（amd64）',
  'linux/arm64': 'ARM64（arm64）',
};

export function renderDeploymentDoc(template, { version, platform, image }) {
  if (!Object.hasOwn(ARCHITECTURES, platform)) throw new Error(`不支持的发布平台：${platform}`);
  if (typeof template !== 'string' || !template.trim()) throw new Error('部署文档模板不能为空');
  if (typeof version !== 'string' || !version || typeof image !== 'string' || !image) {
    throw new Error('部署文档需要版本号和镜像名称');
  }
  const values = {
    VERSION: version, PLATFORM: platform, IMAGE: image,
    ARCH: platform.split('/')[1], ARCHITECTURE: ARCHITECTURES[platform],
  };
  return template.replace(/\{\{\s*([A-Z][A-Z0-9_]*)\s*\}\}/g, (_, key) => {
    if (!Object.hasOwn(values, key)) throw new Error(`未知的部署文档占位符：${key}`);
    return values[key];
  });
}
