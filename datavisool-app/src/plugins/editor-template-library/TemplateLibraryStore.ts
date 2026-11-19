/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

/** Owns the private refresh signal for the template library panel. */
export default class TemplateLibraryStore {
    private readonly listeners = new Set<() => void>();

    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    refresh(): void {
        for (const listener of [...this.listeners]) listener();
    }

    dispose(): void { this.listeners.clear(); }
}
