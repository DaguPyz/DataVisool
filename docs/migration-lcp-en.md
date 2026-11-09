# Migrating from LCP to DataVisool Web

[简体中文](migration-lcp.md) | English

This guide describes the current DataVisool Web implementation in this repository (application version `2026.9.0`). Migration starts with a **project ZIP exported from LCP**, not an old installation directory or database. Web and Desktop have different import rules.

## Current status

The Web importer retains support for some legacy project packages and converts recognized project settings and custom components. A successful import means project data was written; it **does not guarantee identical visuals, data, or interactions**.

There is no complete compatibility list by LCP application version. The table describes package structures recognized by the current implementation, not a guarantee for all real projects. Real samples of no-manifest packages and manifest version 1 have not been verified; comprehensive testing of real-project assets and browser interactions remains incomplete.

## Identify the package

Inspect the ZIP **read-only** and check for `manifest.json` at its root. Do not modify the manifest, repackage the archive, or bypass validation.

| Package | Current Web behavior | Boundary and next step |
| --- | --- | --- |
| Manifest with `format: light-chaser-project` and unencrypted `formatVersion` 2 or 3 | Import can be attempted, subject to project, asset, reference, and file validation. | A nonempty `projects` list uses the multi-project path; otherwise the single-project path is used. Acceptance is not guaranteed for every package. |
| Legacy `light-chaser-project` manifest with version 1 or no `formatVersion` | The importer attempts compatibility, choosing the single- or multi-project path based on the `projects` list. | No real sample has been verified; the rest of the package must still pass validation and be checked after import. |
| No root manifest, but the ZIP contains **one** `.lc` project data file | The legacy importer reads that file and recognized image, font, server component, and script directories. | The `.lc` contents must be valid legacy project dependency data. No real sample has been verified. This path does not provide all manifest-package asset handling; check and, if necessary, manually restore video, models, and external assets. |
| Encrypted package with `encrypted` true, `encryption.mode: package`, and `encryption.algorithm: passphrase-v1` | With the correct passphrase, the importer decrypts and validates the inner manifest package. The outer encrypted manifest can be version 4. | The outer version does not identify the inner project version. The decrypted payload must itself be a supported manifest package. Incorrect passphrases, damaged payloads, and unsupported algorithms fail. |
| Manifest package with supported `enc:v1:` encrypted common API or database fields | The importer attempts to decrypt and import the configuration using the passphrase. | A correct passphrase is required. Connection configuration does not include the database's business data. |

The importer also recognizes `LCPZ1:gzip:` and the supported binary-style `LCPZ` compressed project data. Unknown or damaged compressed formats fail. **Manifest format version is the package format version, not the LCP application version.** Current DataVisool packages use `datavisool-project` and the same import entry point.

## What cannot be directly imported

| Situation | Current limit | What to do |
| --- | --- | --- |
| Only an old installation directory, database, screenshot, or standalone `.lc` file | The import entry point accepts project ZIPs; it does not directly upgrade the old installation or database. A standalone `.lc` file is not a no-manifest ZIP. | Export a complete project ZIP from LCP. If that is impossible, the project needs to be rebuilt manually. |
| A no-manifest ZIP has no `.lc` file or contains multiple `.lc` files | The importer cannot identify a single legacy project data file. | Re-export a complete single-project package from LCP; do not alter the archive to bypass validation. |
| Unknown manifest format, or unencrypted inner version below 1 or above 3 | The current importer rejects it; encrypted outer and decrypted inner manifests are checked separately. | Verify the project export and Web version, then re-export from LCP if needed. Re-exporting does not guarantee compatibility. |
| Unsupported encryption mode, algorithm, compression, or lost passphrase | The current importer cannot automatically decrypt or decompress it. | Recover the passphrase or export a supported package from the original LCP project. Recovery cannot be guaranteed if neither is available. |
| Corrupt ZIP, duplicate paths, missing required files, or failed manifest validation | Invalid content is rejected. | Keep the original, check the source assets, and export again; do not edit files or checksums to force import. |
| Files, services, and database business data outside the package | They are not copied automatically by importing the ZIP. | Migrate, configure, and verify them separately in the target environment. |

## Import and check

1. Export the project ZIP from LCP, keep the original project and package, and resolve export warnings where possible.
2. Create and open an **empty project** in DataVisool Web. Import writes the entry project's data into the current project. A multi-project package can also create additional projects and restore references.
3. In the designer select **More project operations → Import project**, choose the ZIP, and enter the passphrase for encrypted packages or data sources.
4. Review import notices. Assets and data-source records may be created, and matching existing common data sources may be reused. Validate in an isolated environment first.
5. Check the cases below, then export a new DataVisool project package and retain the original backup.

## Common boundaries and remedies

| Situation | Cause and remedy |
| --- | --- |
| A legacy custom component cannot be converted and import fails | Only statically recognizable legacy interfaces and some styles are converted. Unknown members, dynamic access, ambiguous entry points, or unsafe code may be rejected. Identify the component from the error. After backing up, remove it in LCP and re-export; after import, rebuild and upload it using the [component development guide](zh-cn/develop/index.md), then restore its settings and blueprints. Converted components still need runtime checks. |
| Images, fonts, video, or 3D models are missing | Check the original package and export warnings. Files outside the package are not automatically supplied, and only recognized package assets can be mapped. The no-manifest path scans image, font, component, and script directories; video or models may need manual restoration. External URLs and video codecs also need to work in the target environment. |
| Ambiguous same-name assets, font conflicts, or failed file checks | Check for different files with the same name in the source project, adjust names or references, and re-export. Do not modify checksums. |
| Common APIs or databases need to be selected again | Unmapped references are cleared with a notice. Configure and reselect the source in the target site, then test its address, credentials, permissions, and network. Importing connection settings does not migrate business data. |
| Missing subprojects or screen references | Packages with a `projects` list require complete project nodes and references; missing targets or cycles can cause failure. Check the LCP source and re-export. Unmapped screen references in single-project packages are cleared with a notice and must be reselected. |
| Missing passphrase or decryption failure | Use the original export passphrase and check package integrity, mode, and algorithm. Both whole-package and field encryption can require a passphrase. |
| Maps, scripts, blueprints, or components behave differently | Compare with the LCP project and reconfigure incompatible elements. Import does not guarantee old runtime behavior. |
| Package is too large | The importer limits project text, individual files, and cumulative decompressed data; the upload server may impose additional limits. Check the server error, reduce assets, and re-export. |

See [Import and Export Projects](zh-cn/functions/main_desiner/export_import.md) and the [legacy compatibility checklist](../datavisool-doc/旧项目包导入兼容清单.md) for further details (in Chinese).
