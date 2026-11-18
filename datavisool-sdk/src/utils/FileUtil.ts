/*
 * Copyright © 2023–2026 xiaopujun. All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

export default class FileUtil {

    public static async blobToBase64(blobUrl: string): Promise<string | boolean> {
        try {
            const response = await fetch(blobUrl);
            if (!response.ok)
                return false;
            const blob = await response.blob();
            return await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.onerror = () => reject("Failed to convert Blob to Base64");
                reader.readAsDataURL(blob);
            });
        } catch (e) {
            console.error(e);
            return false;
        }
    }

    public static async base64ToBlob(base64: string): Promise<string | boolean> {
        return new Promise((resolve) => {
            fetch(base64).then(response => {
                if (response.ok)
                    return response.blob();
                else
                    resolve(false);
            }).then(blob => {
                if (blob)
                    resolve(URL.createObjectURL(blob));
                resolve(false);
            }).catch(() => {
                resolve(false);
            })
        })
    }

}