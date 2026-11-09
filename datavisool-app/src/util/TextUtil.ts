/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

export default class TextUtil {
    public static async copyToClipboard(text: string): Promise<boolean> {
        if (navigator.clipboard) {
            try {
                await navigator.clipboard.writeText(text);
                return true;
            } catch (err) {
                console.error('Failed to copy text: ', err);
                return false;
            }
        } else {
            const textArea = document.createElement('textarea');
            textArea.value = text;
            document.body.appendChild(textArea);
            textArea.select();
            try {
                document.execCommand('copy');
                return true;
            } catch (err) {
                console.error('Failed to copy text: ', err);
                return false;
            } finally {
                document.body.removeChild(textArea);
            }
        }
    }

    public static async readFromClipboard() {
        if (navigator.clipboard && navigator.clipboard.readText) {
            try {
                return await navigator.clipboard.readText();
            } catch (err) {
                console.error('Failed to read clipboard contents:', err);
                return null;
            }
        } else {
            try {
                const textArea = document.createElement('textarea');
                document.body.appendChild(textArea);
                textArea.focus();
                document.execCommand('paste');
                const clipboardData = textArea.value;
                document.body.removeChild(textArea);
                return clipboardData;
            } catch (err) {
                console.error('Failed to read clipboard contents:', err);
                return null;
            }
        }
    }

}