/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl;

import com.zsq.datavisoolservice.global.AppException;
import com.zsq.datavisoolservice.global.AppStatusCode;
import org.mozilla.javascript.Context;
import org.mozilla.javascript.Function;
import org.mozilla.javascript.RhinoException;
import org.mozilla.javascript.Scriptable;
import org.mozilla.javascript.ScriptableObject;

import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

/** Parses component entry points without evaluating the uploaded source. */
final class ComponentScriptValidator {
    private static final String ACORN_PATH = "/META-INF/resources/webjars/acorn/8.16.0/dist/acorn.js";
    private static final String ACORN_SOURCE = loadAcorn();
    private static final ThreadLocal<Scriptable> SCOPES = new ThreadLocal<>();

    private ComponentScriptValidator() {}

    static void validate(byte[] bytes, String name) {
        final String source;
        try {
            source = StandardCharsets.UTF_8.newDecoder().decode(ByteBuffer.wrap(bytes)).toString();
        } catch (CharacterCodingException error) {
            throw new AppException(AppStatusCode.INVALID_PARAM, "组件脚本必须使用 UTF-8 编码");
        }
        try (Context context = Context.enter()) {
            context.setLanguageVersion(Context.VERSION_ECMASCRIPT);
            context.setOptimizationLevel(0);
            context.setClassShutter(className -> false);
            Scriptable scope = SCOPES.get();
            if (scope == null) {
                scope = context.initSafeStandardObjects();
                context.evaluateString(scope, ACORN_SOURCE, "acorn", 1, null);
                SCOPES.set(scope);
            }
            Scriptable acorn = (Scriptable) ScriptableObject.getProperty(scope, "acorn");
            Function parse = (Function) ScriptableObject.getProperty(acorn, "parse");
            boolean module = name.toLowerCase(Locale.ROOT).endsWith(".mjs");
            try {
                parse(context, scope, acorn, parse, source, module ? "module" : "script");
            } catch (RhinoException firstError) {
                if (module) throw firstError;
                // JS files may also be loaded as ES modules.
                parse(context, scope, acorn, parse, source, "module");
            }
        } catch (RhinoException | StackOverflowError error) {
            throw new AppException(AppStatusCode.INVALID_PARAM, "组件脚本语法无效或过于复杂");
        }
    }

    private static void parse(Context context, Scriptable scope, Scriptable acorn, Function parse, String source, String type) {
        Scriptable options = context.newObject(scope);
        ScriptableObject.putProperty(options, "ecmaVersion", "latest");
        ScriptableObject.putProperty(options, "sourceType", type);
        ScriptableObject.putProperty(options, "allowHashBang", true);
        parse.call(context, scope, acorn, new Object[]{source, options});
    }

    private static String loadAcorn() {
        try (InputStream input = ComponentScriptValidator.class.getResourceAsStream(ACORN_PATH)) {
            if (input == null) throw new IllegalStateException("Acorn parser resource missing");
            return new String(input.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException error) {
            throw new IllegalStateException("Unable to load Acorn parser", error);
        }
    }
}
