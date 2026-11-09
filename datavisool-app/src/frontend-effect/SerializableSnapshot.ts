/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
/**
 * 将运行时对象转换为与 Tauri IPC 往返后一致的 JSON 快照。
 *
 * 例如对象中的 `undefined` 字段会在 IPC 序列化时被移除；并发校验必须在
 * 两侧使用相同表示，否则未发生变化的运行时对象也会被误判为冲突。
 */
export function toSerializableSnapshot(value: unknown): unknown {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? null : JSON.parse(serialized);
}
