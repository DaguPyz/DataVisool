/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {useEffect, useRef, useState} from "react";
import ReleaseNotesMarkdown from "@/comps/common-component/update-release-notes/ReleaseNotesMarkdown.tsx";

interface AiDrivenStreamingMessageProps {
    content: string;
    fallback: string;
    active: boolean;
    animateInitial?: boolean;
    onContentChange: () => void;
    onRevealStateChange?: (revealing: boolean) => void;
}

/** 将事件批量文本平滑展开；Store 中仍保留完整原文。 */
const AiDrivenStreamingMessage = ({
    content,
    fallback,
    active,
    animateInitial = false,
    onContentChange,
    onRevealStateChange,
}: AiDrivenStreamingMessageProps) => {
    // 历史内容直接展示；当前流式消息可从空文本开始平滑展开。
    const [displayedText, setDisplayedText] = useState(animateInitial ? "" : content);
    const displayedRef = useRef(displayedText);
    const displayedCountRef = useRef(Array.from(displayedText).length);
    const lastFrameAtRef = useRef(0);
    const characterCreditRef = useRef(1);
    const reducedMotionRef = useRef(window.matchMedia("(prefers-reduced-motion: reduce)").matches);

    displayedRef.current = displayedText;

    useEffect(() => {
        const target = Array.from(content);
        const current = displayedRef.current;
        if (reducedMotionRef.current || !content.startsWith(current)) {
            displayedRef.current = content;
            displayedCountRef.current = target.length;
            setDisplayedText(content);
            return;
        }
        if (current === content) {
            lastFrameAtRef.current = 0;
            characterCreditRef.current = 1;
            return;
        }

        let frameId = 0;
        const revealNextFrame = (frameAt: number) => {
            const currentCount = displayedCountRef.current;
            const pendingCount = target.length - currentCount;
            if (pendingCount <= 0) {
                lastFrameAtRef.current = 0;
                characterCreditRef.current = 1;
                return;
            }

            const elapsed = lastFrameAtRef.current > 0
                ? Math.min(50, Math.max(0, frameAt - lastFrameAtRef.current))
                : 16;
            lastFrameAtRef.current = frameAt;
            characterCreditRef.current += elapsed * revealRate(pendingCount) / 1000;
            const revealCount = Math.min(pendingCount, Math.floor(characterCreditRef.current));
            if (revealCount > 0) {
                characterCreditRef.current -= revealCount;
                const nextText = target.slice(0, currentCount + revealCount).join("");
                displayedRef.current = nextText;
                displayedCountRef.current = currentCount + revealCount;
                setDisplayedText(nextText);
            }
            frameId = window.requestAnimationFrame(revealNextFrame);
        };
        frameId = window.requestAnimationFrame(revealNextFrame);
        return () => window.cancelAnimationFrame(frameId);
    }, [content]);

    useEffect(() => {
        onContentChange();
    }, [displayedText, onContentChange]);

    const contentFollowsDisplayed = content.startsWith(displayedText);
    const revealing = contentFollowsDisplayed && displayedText !== content && !reducedMotionRef.current;
    const renderedText = contentFollowsDisplayed ? displayedText : content;
    useEffect(() => {
        onRevealStateChange?.(revealing);
    }, [onRevealStateChange, revealing]);

    return (
        <ReleaseNotesMarkdown content={renderedText}
                              fallback={fallback}
                              embedded
                              streaming={active || revealing}/>
    );
};

const revealRate = (pendingCount: number) => {
    return pendingCount > 160 ? 220
        : pendingCount > 80 ? 140
            : pendingCount > 32 ? 90
                : 60;
};

export default AiDrivenStreamingMessage;
