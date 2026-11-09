/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {memo, type ReactNode} from "react";
import styles from "./ReleaseNotesMarkdown.module.less";

interface ReleaseNotesMarkdownProps {
    content?: string | null;
    fallback: ReactNode;
    embedded?: boolean;
    streaming?: boolean;
}

type InlineTokenType = "code" | "link" | "strong" | "emphasis";

interface InlineToken {
    type: InlineTokenType;
    index: number;
    length: number;
    value: string;
    href?: string;
}

const headingPattern = /^(#{1,6})\s+(.+)$/;
const unorderedListPattern = /^\s*[-+*]\s+(.+)$/;
const orderedListPattern = /^\s*(\d+)[.)]\s+(.+)$/;
const blockquotePattern = /^\s*>\s?(.*)$/;
const horizontalRulePattern = /^\s{0,3}(?:(?:-\s*){3,}|(?:_\s*){3,}|(?:\*\s*){3,})$/;
const fencePattern = /^\s{0,3}(`{3,}|~{3,})\s*([\w-]*)\s*$/;
const tableDelimiterPattern = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/;

function parseTableRow(line: string): string[] {
    return line.trim()
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((cell) => cell.trim());
}

function isTableStart(lines: string[], index: number): boolean {
    if (index + 1 >= lines.length || !lines[index].includes("|"))
        return false;
    const headerCells = parseTableRow(lines[index]);
    const delimiterCells = parseTableRow(lines[index + 1]);
    return headerCells.length > 1
        && headerCells.length === delimiterCells.length
        && tableDelimiterPattern.test(lines[index + 1]);
}

function findInlineToken(source: string, from: number): InlineToken | null {
    const candidates: InlineToken[] = [];
    const patterns: Array<{
        type: InlineTokenType;
        expression: RegExp;
        toToken: (match: RegExpExecArray) => Pick<InlineToken, "value" | "href">;
    }> = [
        {
            type: "code",
            expression: /`([^`\n]+)`/g,
            toToken: (match) => ({value: match[1]}),
        },
        {
            type: "link",
            expression: /\[([^\]\n]+)]\(([^)\s]+)(?:\s+"[^"]*")?\)/g,
            toToken: (match) => ({value: match[1], href: match[2]}),
        },
        {
            type: "strong",
            expression: /\*\*([^*\n]+)\*\*|__([^_\n]+)__/g,
            toToken: (match) => ({value: match[1] ?? match[2]}),
        },
        {
            type: "emphasis",
            expression: /\*([^*\n]+)\*|_([^_\n]+)_/g,
            toToken: (match) => ({value: match[1] ?? match[2]}),
        },
    ];

    patterns.forEach(({type, expression, toToken}) => {
        expression.lastIndex = from;
        const match = expression.exec(source);
        if (!match)
            return;
        candidates.push({
            type,
            index: match.index,
            length: match[0].length,
            ...toToken(match),
        });
    });

    return candidates.reduce<InlineToken | null>((nearest, candidate) => {
        if (!nearest || candidate.index < nearest.index)
            return candidate;
        return nearest;
    }, null);
}

function safeLinkHref(href: string): string | null {
    if (/^https?:\/\//i.test(href) || /^mailto:/i.test(href) || href.startsWith("#"))
        return href;
    return null;
}

function renderInline(source: string, keyPrefix: string): ReactNode[] {
    const nodes: ReactNode[] = [];
    let cursor = 0;
    let tokenIndex = 0;

    while (cursor < source.length) {
        const token = findInlineToken(source, cursor);
        if (!token) {
            nodes.push(source.slice(cursor));
            break;
        }

        if (token.index > cursor)
            nodes.push(source.slice(cursor, token.index));

        const key = `${keyPrefix}-${tokenIndex}`;
        if (token.type === "code") {
            nodes.push(<code key={key}>{token.value}</code>);
        } else if (token.type === "strong") {
            nodes.push(<strong key={key}>{renderInline(token.value, `${key}-strong`)}</strong>);
        } else if (token.type === "emphasis") {
            nodes.push(<em key={key}>{renderInline(token.value, `${key}-emphasis`)}</em>);
        } else {
            const href = token.href ? safeLinkHref(token.href) : null;
            nodes.push(href ? (
                <a key={key} href={href} target={href.startsWith("#") ? undefined : "_blank"} rel="noreferrer">
                    {renderInline(token.value, `${key}-link`)}
                </a>
            ) : token.value);
        }

        cursor = token.index + token.length;
        tokenIndex += 1;
    }

    return nodes;
}

function isBlockStart(line: string): boolean {
    return headingPattern.test(line)
        || unorderedListPattern.test(line)
        || orderedListPattern.test(line)
        || blockquotePattern.test(line)
        || horizontalRulePattern.test(line)
        || fencePattern.test(line);
}

function renderMarkdown(content: string): ReactNode[] {
    const lines = content.replace(/\r\n?/g, "\n").split("\n");
    const blocks: ReactNode[] = [];
    let lineIndex = 0;
    let blockIndex = 0;

    while (lineIndex < lines.length) {
        const line = lines[lineIndex];
        if (!line.trim()) {
            lineIndex += 1;
            continue;
        }

        const key = `release-note-${blockIndex}`;
        if (isTableStart(lines, lineIndex)) {
            const headers = parseTableRow(line);
            const rows: string[][] = [];
            lineIndex += 2;
            while (lineIndex < lines.length && lines[lineIndex].includes("|") && lines[lineIndex].trim()) {
                const cells = parseTableRow(lines[lineIndex]);
                if (cells.length !== headers.length)
                    break;
                rows.push(cells);
                lineIndex += 1;
            }
            blocks.push(
                <div className={styles.tableScroll} key={key}>
                    <table>
                        <thead>
                            <tr>
                                {headers.map((cell, cellIndex) => (
                                    <th key={`${key}-header-${cellIndex}`}>
                                        {renderInline(cell, `${key}-header-${cellIndex}`)}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row, rowIndex) => (
                                <tr key={`${key}-row-${rowIndex}`}>
                                    {row.map((cell, cellIndex) => (
                                        <td key={`${key}-row-${rowIndex}-${cellIndex}`}>
                                            {renderInline(cell, `${key}-row-${rowIndex}-${cellIndex}`)}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            );
            blockIndex += 1;
            continue;
        }

        const fence = fencePattern.exec(line);
        if (fence) {
            const marker = fence[1][0];
            const minimumLength = fence[1].length;
            const closingFence = new RegExp(`^\\s{0,3}\\${marker}{${minimumLength},}\\s*$`);
            const codeLines: string[] = [];
            lineIndex += 1;
            while (lineIndex < lines.length && !closingFence.test(lines[lineIndex])) {
                codeLines.push(lines[lineIndex]);
                lineIndex += 1;
            }
            if (lineIndex < lines.length)
                lineIndex += 1;
            const language = fence[2] ? `language-${fence[2]}` : undefined;
            blocks.push(
                <pre key={key}>
                    <code className={language}>{codeLines.join("\n")}</code>
                </pre>
            );
            blockIndex += 1;
            continue;
        }

        const heading = headingPattern.exec(line);
        if (heading) {
            const level = heading[1].length;
            const children = renderInline(heading[2], `${key}-heading`);
            if (level === 1) blocks.push(<h1 key={key}>{children}</h1>);
            else if (level === 2) blocks.push(<h2 key={key}>{children}</h2>);
            else if (level === 3) blocks.push(<h3 key={key}>{children}</h3>);
            else if (level === 4) blocks.push(<h4 key={key}>{children}</h4>);
            else if (level === 5) blocks.push(<h5 key={key}>{children}</h5>);
            else blocks.push(<h6 key={key}>{children}</h6>);
            lineIndex += 1;
            blockIndex += 1;
            continue;
        }

        const unorderedItem = unorderedListPattern.exec(line);
        if (unorderedItem) {
            const items: string[] = [];
            while (lineIndex < lines.length) {
                const match = unorderedListPattern.exec(lines[lineIndex]);
                if (!match)
                    break;
                items.push(match[1]);
                lineIndex += 1;
            }
            blocks.push(
                <ul key={key}>
                    {items.map((item, itemIndex) => (
                        <li key={`${key}-item-${itemIndex}`}>{renderInline(item, `${key}-item-${itemIndex}`)}</li>
                    ))}
                </ul>
            );
            blockIndex += 1;
            continue;
        }

        const orderedItem = orderedListPattern.exec(line);
        if (orderedItem) {
            const start = Number(orderedItem[1]);
            const items: string[] = [];
            while (lineIndex < lines.length) {
                const match = orderedListPattern.exec(lines[lineIndex]);
                if (!match)
                    break;
                items.push(match[2]);
                lineIndex += 1;
            }
            blocks.push(
                <ol key={key} start={start}>
                    {items.map((item, itemIndex) => (
                        <li key={`${key}-item-${itemIndex}`}>{renderInline(item, `${key}-item-${itemIndex}`)}</li>
                    ))}
                </ol>
            );
            blockIndex += 1;
            continue;
        }

        const quote = blockquotePattern.exec(line);
        if (quote) {
            const quoteLines: string[] = [];
            while (lineIndex < lines.length) {
                const match = blockquotePattern.exec(lines[lineIndex]);
                if (!match)
                    break;
                quoteLines.push(match[1]);
                lineIndex += 1;
            }
            blocks.push(<blockquote key={key}>{renderMarkdown(quoteLines.join("\n"))}</blockquote>);
            blockIndex += 1;
            continue;
        }

        if (horizontalRulePattern.test(line)) {
            blocks.push(<hr key={key}/>);
            lineIndex += 1;
            blockIndex += 1;
            continue;
        }

        const paragraphLines: string[] = [];
        while (lineIndex < lines.length && lines[lineIndex].trim() && !isBlockStart(lines[lineIndex])) {
            paragraphLines.push(lines[lineIndex].trim());
            lineIndex += 1;
        }
        blocks.push(<p key={key}>{renderInline(paragraphLines.join(" "), `${key}-paragraph`)}</p>);
        blockIndex += 1;
    }

    return blocks;
}

const MarkdownBlocks = memo(({content}: {content: string}) => <>{renderMarkdown(content)}</>);
MarkdownBlocks.displayName = "MarkdownBlocks";

const StreamingMarkdown = ({content}: {content: string}) => {
    const boundary = lastCompletedBlockBoundary(content);
    const stableContent = content.slice(0, boundary).trimEnd();
    const activeContent = content.slice(boundary);
    return (
        <>
            {stableContent && <MarkdownBlocks content={stableContent}/>}
            <p className={styles.streamingTail}>
                {renderInline(activeContent, "streaming-tail")}
                <span className={styles.streamingCursor} aria-hidden="true"/>
            </p>
        </>
    );
};

const lastCompletedBlockBoundary = (content: string) => {
    const matches = [...content.matchAll(/\n[\t ]*\n/g)];
    const lastMatch = matches.at(-1);
    return lastMatch ? (lastMatch.index ?? 0) + lastMatch[0].length : 0;
};

export default function ReleaseNotesMarkdown({
    content,
    fallback,
    embedded = false,
    streaming = false,
}: ReleaseNotesMarkdownProps) {
    const normalizedContent = content?.trim();

    return (
        <div className={`${styles.releaseNotes} ${embedded ? styles.embedded : ""}`}>
            {normalizedContent
                ? streaming
                    ? <StreamingMarkdown content={normalizedContent}/>
                    : <MarkdownBlocks content={normalizedContent}/>
                : fallback}
        </div>
    );
}
