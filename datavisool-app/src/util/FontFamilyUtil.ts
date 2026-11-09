/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
const genericFamilies = new Set([
    'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui',
    'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded', 'emoji', 'math', 'fangsong',
    'inherit', 'initial', 'unset', 'revert', 'revert-layer',
]);

/** Extract explicit CSS font family names without mistaking generic families for files. */
export function parseFontFamilyNames(value: string): string[] {
    const parts: string[] = [];
    let part = '';
    let quote = '';
    for (let i = 0; i < value.length; i++) {
        const char = value[i];
        if (char === '\\' && i + 1 < value.length) {
            part += char + value[++i];
        } else if (quote) {
            part += char;
            if (char === quote) quote = '';
        } else if (char === '"' || char === "'") {
            quote = char;
            part += char;
        } else if (char === ',') {
            parts.push(part);
            part = '';
        } else {
            part += char;
        }
    }
    if (quote) return [];
    parts.push(part);

    return parts.flatMap(raw => {
        const token = raw.trim();
        if (!token) return [];
        const quoted = (token[0] === '"' || token[0] === "'") && token[token.length - 1] === token[0];
        if (!quoted && /["']/.test(token)) return [];
        const decoded = (quoted ? token.slice(1, -1) : token).replace(
            /\\([\da-f]{1,6})(?:\r\n|[\t\n\f\r ])?|\\([^\n\r\f])/gi,
            (_match, hex: string | undefined, escaped: string | undefined) => {
                if (!hex) return escaped ?? '';
                const codePoint = parseInt(hex, 16);
                return String.fromCodePoint(codePoint === 0 || codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff) ? 0xfffd : codePoint);
            },
        );
        const name = quoted ? decoded : decoded.trim();
        if (!name || (!quoted && (genericFamilies.has(name.toLowerCase()) || /[()]/.test(name)))) return [];
        return [name];
    });
}

export function collectFontFamilies(target: Set<string>, value: unknown): void {
    if (Array.isArray(value)) {
        value.forEach(item => collectFontFamilies(target, item));
    } else if (value !== null && typeof value === 'object') {
        Object.entries(value).forEach(([key, item]) => {
            if (key === 'fontFamily' && typeof item === 'string') {
                parseFontFamilyNames(item).forEach(name => target.add(name));
            } else {
                collectFontFamilies(target, item);
            }
        });
    }
}
