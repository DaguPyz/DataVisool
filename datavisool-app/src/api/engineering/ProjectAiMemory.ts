/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
/** Project-level AI context maintained by the Web API. */
export interface IProjectAiMemory {
    projectId: string;
    summary: string;
    styleTone: string;
    layoutTone: string;
    colorSystem: string;
    components: string[];
    updatedAt: string;
}
