declare module 'virtual:user-guide/catalog' {
    const loaders: Record<string, () => Promise<import('./content').DocArticle>>;
    export default loaders;
}

declare module 'virtual:user-guide/search-index' {
    const index: import('./content').SearchEntry[];
    export default index;
}
