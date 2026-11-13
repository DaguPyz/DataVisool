/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import {type CSSProperties, type MouseEvent as ReactMouseEvent} from "react";
import type {
    AiDrivenShortcutCommand,
    AiDrivenShortcutPanelPlacement,
} from "./AiDrivenShortcutCommands.ts";
import "./AiDrivenShortcutPanel.less";

interface AiDrivenShortcutPanelProps {
    visible: boolean;
    placement: AiDrivenShortcutPanelPlacement;
    panelStyle: CSSProperties | null;
    commands: AiDrivenShortcutCommand[];
    onSelect: (command: AiDrivenShortcutCommand) => void;
}

const AiDrivenShortcutPanel = (props: AiDrivenShortcutPanelProps) => {
    const {visible, placement, panelStyle, commands, onSelect} = props;
    if (!visible || !panelStyle || commands.length === 0)
        return null;

    const handleMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
        event.preventDefault();
    };
    const panelClassName = `ai-driven-shortcut-panel is-${placement}`;

    return (
        <div className={panelClassName}
             style={panelStyle}
             role="listbox"
             aria-label="快捷指令"
             onMouseDown={handleMouseDown}>
            <div className="ai-driven-shortcut-panel-header">
                <span className="ai-driven-shortcut-panel-title">快捷指令</span>
            </div>
            <div className="ai-driven-shortcut-list">
                {commands.map((command) => (
                    <button key={command.command}
                            className="ai-driven-shortcut-item"
                            type="button"
                            role="option"
                            aria-selected="true"
                            onClick={() => onSelect(command)}>
                        <span className="ai-driven-shortcut-token">/{command.title}</span>
                        <span className="ai-driven-shortcut-summary">{command.summary}</span>
                    </button>
                ))}
            </div>
        </div>
    );
};

export default AiDrivenShortcutPanel;
