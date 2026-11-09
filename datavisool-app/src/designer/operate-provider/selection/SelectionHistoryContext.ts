/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
let selectionProvider: () => string[] = () => [];

export const setHistorySelectionProvider = (provider: () => string[]) => {
    selectionProvider = provider;
};

export const getHistorySelectionIds = () => [...selectionProvider()];
