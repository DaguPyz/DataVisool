<!-- Licensed under the DataVisool License. See the LICENSE file distributed with this software. -->
#### 镜像命令

```shell
# 构建镜像
docker build -t datavisool-web:2025.2 .

# 导出镜像到指定目录
docker save -o E:\light-chaser\pro\2025.1\bootstrap\docker\datavisool-web.tar datavisool-web:2025.2

```

## 辅助工具

```ts
// 快速渲染当前图层链表结构关系
window.renderLinks = () => {
    const links = Object.values(window.DATAVISOOL_ENV.currentManager.layerManager.layerConfigs).map(i => {
        const layers = window.DATAVISOOL_ENV.currentManager.layerManager.layerConfigs;
        return {id: i.id, name: i.name, pid: layers[i.pid]?.name, prev: layers[i.prev]?.name, next: layers[i.next]?.name}
    })
    console.log(links)
}
```
