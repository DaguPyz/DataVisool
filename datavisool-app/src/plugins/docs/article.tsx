/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */

import {Children, isValidElement, memo, ReactNode, useMemo, useState} from "react";
import ReactMarkdown, {Components, ExtraProps} from "react-markdown";
import {Link} from "react-router-dom";
import remarkGfm from "remark-gfm";
import type {DocArticle} from "./content";

export interface MarkdownArticleProps {
    article: DocArticle;
    onImageClick?: (src: string, alt: string) => void;
}

function MarkdownArticle({article, onImageClick}: MarkdownArticleProps) {
    const components = useMemo<Components>(() => {
        const headingsByLine = new Map(article.headings.map(heading => [heading.line, heading]));

        const renderHeading = ({children, node}: ExtraProps & {children?: ReactNode}) => {
            const line = node?.position?.start.line;
            if (line === undefined || line === article.titleLine) return null;
            const heading = headingsByLine.get(line);
            const Tag = (node?.tagName || 'h2') as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
            return <Tag id={heading?.id} className="docs-heading">{children}</Tag>;
        };

        return {
            h1: renderHeading, h2: renderHeading, h3: renderHeading,
            h4: renderHeading, h5: renderHeading, h6: renderHeading,
            a({href, children, title}) {
                const resolvedHref = article.links[decodeURI(href ?? "")] ?? href ?? "";
                if (isBilibiliVideo(resolvedHref)) {
                    return <BilibiliVideo href={resolvedHref}>{children}</BilibiliVideo>;
                }
                if (!resolvedHref || resolvedHref.startsWith("#")) {
                    return <a href={resolvedHref || undefined} title={title}>{children}</a>;
                }
                if (isExternalLink(resolvedHref)) {
                    return <a href={resolvedHref} title={title} target="_blank" rel="noreferrer noopener">{children}</a>;
                }
                return <Link to={resolvedHref} title={title}>{children}</Link>;
            },
            img({src, alt = "", title}) {
                const resolvedSrc = article.images[decodeURI(src ?? "")] ?? src;
                if (!resolvedSrc) {
                    return null;
                }
                return (
                    <img
                        className="docs-image"
                        src={resolvedSrc}
                        alt={alt}
                        title={title}
                        loading="lazy"
                        role={onImageClick ? "button" : undefined}
                        tabIndex={onImageClick ? 0 : undefined}
                        onClick={() => onImageClick?.(resolvedSrc, alt)}
                        onKeyDown={event => {
                            if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                onImageClick?.(resolvedSrc, alt);
                            }
                        }}
                    />
                );
            },
            table({children}) {
                return <div className="docs-table-wrapper"><table>{children}</table></div>;
            },
            pre({children}) {
                return (
                    <div className="docs-code-block">
                        <CopyCodeButton code={getNodeText(children)}/>
                        <pre>{children}</pre>
                    </div>
                );
            },
        };
    }, [article, onImageClick]);

    return (
        <article className="docs-article">
            <div className="docs-article-content">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
                    {article.markdown}
                </ReactMarkdown>
            </div>
        </article>
    );
}

export default memo(MarkdownArticle);

function CopyCodeButton({code}: {code: string}) {
    const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

    async function copyCode() {
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(code);
            } else if (!copyCodeWithDocument(code)) {
                throw new Error("浏览器未能复制代码");
            }
            setStatus("copied");
        } catch {
            setStatus("failed");
        }
    }

    const label = status === "copied" ? "已复制" : status === "failed" ? "复制失败" : "复制代码";
    return <button className="docs-code-copy" type="button" onClick={copyCode}>{label}</button>;
}

function copyCodeWithDocument(code: string): boolean {
    const textarea = document.createElement("textarea");
    textarea.value = code;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    try {
        textarea.select();
        textarea.setSelectionRange(0, textarea.value.length);
        return document.execCommand("copy");
    } finally {
        textarea.remove();
    }
}

function BilibiliVideo({href, children}: {href: string; children: ReactNode}) {
    const [loaded, setLoaded] = useState(false);
    const videoId = href.match(/\/video\/(BV[0-9A-Za-z]+)/i)?.[1];
    if (!videoId) {
        return <a href={href} target="_blank" rel="noreferrer noopener">{children}</a>;
    }

    const playerUrl = `https://player.bilibili.com/player.html?bvid=${encodeURIComponent(videoId)}&autoplay=0`;
    return (
        <span className="docs-video-link">
            {loaded ? (
                <span className="docs-video-frame">
                    <iframe
                        src={playerUrl}
                        title={getNodeText(children) || "哔哩哔哩视频"}
                        loading="lazy"
                        allowFullScreen
                        referrerPolicy="strict-origin-when-cross-origin"
                    />
                </span>
            ) : (
                <button type="button" onClick={() => setLoaded(true)}>
                    <span aria-hidden="true">▶</span>
                    <span>{children}</span>
                </button>
            )}
            <a href={href} target="_blank" rel="noreferrer noopener">在哔哩哔哩打开</a>
        </span>
    );
}

function getNodeText(node: ReactNode): string {
    return Children.toArray(node).map(child => {
        if (typeof child === "string" || typeof child === "number") {
            return String(child);
        }
        if (isValidElement<{children?: ReactNode}>(child)) {
            return getNodeText(child.props.children);
        }
        return "";
    }).join("");
}

function isBilibiliVideo(href: string): boolean {
    return /^(?:https?:)?\/\/(?:www\.)?bilibili\.com\/video\/BV[0-9A-Za-z]+/i.test(href);
}

function isExternalLink(href: string): boolean {
    return /^(?:https?:)?\/\//i.test(href) || /^(?:mailto|tel):/i.test(href);
}
