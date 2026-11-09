/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {describe, expect, test} from "vitest";
import ExportSecretUtil from "@/util/ExportSecretUtil.ts";

describe("ExportSecretUtil", () => {
    test("builds only plain or whole-package encryption payloads", () => {
        expect(ExportSecretUtil.buildExportSecretPayload(false)).toEqual({
            secretMode: "plain",
            secretPassphrase: "",
        });
        expect(ExportSecretUtil.buildExportSecretPayload(true, "export-secret")).toEqual({
            secretMode: "passphrase-v1",
            secretPassphrase: "export-secret",
        });
    });

    test("requires matching passphrases when whole-package encryption is enabled", () => {
        expect(ExportSecretUtil.validateExportSecretForm({
            encryptPackage: true,
            secretPassphrase: "export-secret",
            confirmSecretPassphrase: "different-secret",
        })).toEqual({
            secretPassphraseErrors: [],
            confirmSecretPassphraseErrors: ["两次输入的导出口令不一致"],
        });
    });

    test("does not require a passphrase for a plain package", () => {
        expect(ExportSecretUtil.validateExportSecretForm({encryptPackage: false})).toEqual({
            secretPassphraseErrors: [],
            confirmSecretPassphraseErrors: [],
        });
    });
});
