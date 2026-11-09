/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl;

import com.zsq.datavisoolservice.global.AppException;
import org.junit.Test;

import java.nio.charset.StandardCharsets;

import static org.junit.Assert.assertThrows;

public class ComponentScriptValidatorTest {
    private static byte[] utf8(String source) {return source.getBytes(StandardCharsets.UTF_8);}

    @Test public void validatesScriptsAndModulesWithoutExecutingThem() {
        ComponentScriptValidator.validate(utf8("throw Error('must not execute'); const x = obj?.value ?? 0;"), "component.js");
        ComponentScriptValidator.validate(utf8("import x from './x.js'; export default x;"), "component.mjs");
        ComponentScriptValidator.validate(utf8("export const x = 1;"), "component.js");
        ComponentScriptValidator.validate(utf8("with (obj) { x = y; }"), "legacy.js");
    }

    @Test public void rejectsBadSyntaxAndInvalidUtf8() {
        assertThrows(AppException.class, () -> ComponentScriptValidator.validate(utf8("const = ;"), "bad.js"));
        assertThrows(AppException.class, () -> ComponentScriptValidator.validate(utf8("export const = ;"), "bad.mjs"));
        assertThrows(AppException.class, () -> ComponentScriptValidator.validate(new byte[]{(byte) 0xc3, 0x28}, "bad.js"));
    }
}
