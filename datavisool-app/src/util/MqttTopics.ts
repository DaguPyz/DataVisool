/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

/** Split a comma-separated list while preserving spaces within each topic. */
export function parseMqttTopics(topics: string): string[] {
    return topics.split(',').map(topic => topic.trim());
}
