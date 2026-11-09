/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl;

import org.junit.Test;
import org.mozilla.javascript.Context;
import org.mozilla.javascript.Scriptable;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import static org.junit.Assert.*;

public class LegacyComponentImportGuardTest {
    @Test
    public void convertsRecognizedWrapperWithoutExecutingComponent() throws Exception {
        Path file = Files.createTempFile("component-", ".js");
        try {
            Files.writeString(file, "var __LIGHT_CHASER_REMOTE_COMPONENT_TEMP__=function(R,I,U,V){return class extends I.AbstractDesignerDefinition { method(){return [U.ObjectUtil.merge({},{}),V.LCGUI]} }}(React,LightChaserInterface,LightChaserUtil,LightChaserUI);", StandardCharsets.UTF_8);
            LegacyComponentImportGuard.validate(file, "example.js");
            String converted = Files.readString(file);
            assertTrue(converted.contains("__DATAVISOOL_REMOTE_COMPONENT_TEMP__"));
            assertTrue(converted.contains("DataVisoolSDK,DataVisoolSDK,DataVisoolUI"));
            assertTrue(converted.contains("V.DatavisoolGUI"));
            assertFalse(converted.contains("LightChaser"));
        } finally {
            Files.deleteIfExists(file);
        }
    }

    @Test
    public void rejectsUnknownMembersAndDoesNotModifyTheFile() throws Exception {
        Path file = Files.createTempFile("component-", ".js");
        String source = "var __LIGHT_CHASER_REMOTE_COMPONENT_TEMP__=function(U){return U.FetchUtil}(LightChaserUtil);";
        try {
            Files.writeString(file, source, StandardCharsets.UTF_8);
            IllegalArgumentException error = assertThrows(IllegalArgumentException.class,
                    () -> LegacyComponentImportGuard.validate(file, "example.js"));
            assertTrue(error.getMessage().contains("example.js"));
            assertTrue(error.getMessage().contains("FetchUtil"));
            assertTrue(error.getMessage().contains("共享 SDK 未提供对应网络工具"));
            assertEquals(source, Files.readString(file));
        } finally {
            Files.deleteIfExists(file);
        }
    }

    @Test
    public void convertsKnownLcpUiMembersAndRejectsUnknownOnes() throws Exception {
        Path file = Files.createTempFile("component-", ".js");
        try {
            String source = "var __LIGHT_CHASER_REMOTE_COMPONENT_TEMP__=function(UI){return [UI.LCGUI,UI.LCGUIUtil,UI.LCGUIUtilDefault,UI.Button,UI.Input,UI.Dialog,UI.Select,UI.CheckBox,UI.globalMessage,UI.LCPUIContext,UI.LCPUIProvider,UI.useLCPUI]}(LCPUI);";
            Files.writeString(file, source, StandardCharsets.UTF_8);
            LegacyComponentImportGuard.validate(file, "example.js");
            String converted = Files.readString(file);
            assertTrue(converted.contains("UI.DatavisoolGUI,"));
            assertTrue(converted.contains("UI.DatavisoolGUIUtil,"));
            assertTrue(converted.contains("UI.DatavisoolGUIUtilDefault,"));
            assertTrue(converted.contains("UI.Button,UI.Input,UI.Dialog"));
            assertTrue(converted.contains("UI.Select,UI.CheckBox,UI.globalMessage"));
            assertTrue(converted.contains("UI.DataVisoolUIContext,UI.DataVisoolUIProvider,UI.useDataVisoolUI"));
            assertTrue(converted.contains("}(DataVisoolUI)"));
            assertFalse(converted.contains("LCPUI"));

            String unsupported = source.replace("UI.Button", "UI.UnknownControl");
            Files.writeString(file, unsupported, StandardCharsets.UTF_8);
            IllegalArgumentException error = assertThrows(IllegalArgumentException.class,
                    () -> LegacyComponentImportGuard.validate(file, "example.js"));
            assertTrue(error.getMessage().contains("LCPUI.UnknownControl"));
            assertEquals(unsupported, Files.readString(file));
        } finally {
            Files.deleteIfExists(file);
        }
    }

    @Test
    public void rejectsDynamicAccessAndDynamicExecution() throws Exception {
        for (String body : new String[]{"return U['ObjectUtil']", "return eval('1')", "return '.lcp-button { color: red }'", "return '--lcp-ui-primary'", "return '--lcp-slider-thumb-size'", "return `.lcp-button { color: red }`"}) {
            Path file = Files.createTempFile("component-", ".js");
            try {
                Files.writeString(file, "var __LIGHT_CHASER_REMOTE_COMPONENT_TEMP__=function(U){" + body + "}(LightChaserUtil);", StandardCharsets.UTF_8);
                assertThrows(IllegalArgumentException.class, () -> LegacyComponentImportGuard.validate(file, "example.js"));
            } finally {
                Files.deleteIfExists(file);
            }
        }
    }

    @Test
    public void keepsNestedParametersWithTheSameNameUnchanged() throws Exception {
        Path file = Files.createTempFile("component-", ".js");
        try {
            Files.writeString(file, "var __LIGHT_CHASER_REMOTE_COMPONENT_TEMP__=function(V){function nested(V){return V.LCGUI} return V.LCGUI}(LightChaserUI);", StandardCharsets.UTF_8);
            LegacyComponentImportGuard.validate(file, "example.js");
            String converted = Files.readString(file);
            assertTrue(converted.contains("function nested(V){return V.LCGUI}"));
            assertTrue(converted.contains("return V.DatavisoolGUI"));
        } finally {
            Files.deleteIfExists(file);
        }
    }

    @Test
    public void rejectsAmbiguousDestructuredParameters() throws Exception {
        Path file = Files.createTempFile("component-", ".js");
        try {
            Files.writeString(file, "var __LIGHT_CHASER_REMOTE_COMPONENT_TEMP__=function(V){function nested({value: V}){return V.LCGUI} return V.LCGUI}(LightChaserUI);", StandardCharsets.UTF_8);
            IllegalArgumentException error = assertThrows(IllegalArgumentException.class,
                    () -> LegacyComponentImportGuard.validate(file, "example.js"));
            assertTrue(error.getMessage().contains("参数遮蔽"));
        } finally {
            Files.deleteIfExists(file);
        }
    }

    @Test
    public void detectsEscapedLegacyNamesAcrossBufferBoundaries() throws Exception {
        Path file = Files.createTempFile("component-", ".js");
        try {
            String source = " ".repeat(8189) + "var __\\u004cIGHT_CHASER_REMOTE_COMPONENT_TEMP__=function(U){return U.ObjectUtil.merge({},{})}(\\u004cightChaserUtil);";
            Files.writeString(file, source, StandardCharsets.UTF_8);
            LegacyComponentImportGuard.validate(file, "example.js");
            String converted = Files.readString(file);
            assertTrue(converted.contains("DataVisoolSDK"));
            assertTrue(converted.contains("__DATAVISOOL_REMOTE_COMPONENT_TEMP__"));
        } finally {
            Files.deleteIfExists(file);
        }
    }

    @Test
    public void usesCurrentSdkMergeInTheConvertedComponent() throws Exception {
        Path file = Files.createTempFile("component-", ".js");
        try {
            String source = "var __LIGHT_CHASER_REMOTE_COMPONENT_TEMP__=function(U){return U.ObjectUtil.merge({x:[1,2]},{x:{p:9}})}(LightChaserUtil);";
            Files.writeString(file, source, StandardCharsets.UTF_8);
            LegacyComponentImportGuard.validate(file, "example.js");
            try (Context context = Context.enter()) {
                Scriptable scope = context.initSafeStandardObjects();
                context.evaluateString(scope, "var DataVisoolSDK = {ObjectUtil: {merge: function(original, update) { return {fromCurrentSdk: this === DataVisoolSDK.ObjectUtil, original: original, update: update}; }}};", "setup", 1, null);
                // The synthetic fixture is executed only by this test, never by import.
                context.evaluateString(scope, Files.readString(file), "fixture", 1, null);
                Object result = context.evaluateString(scope, "__DATAVISOOL_REMOTE_COMPONENT_TEMP__.fromCurrentSdk && __DATAVISOOL_REMOTE_COMPONENT_TEMP__.original.x[1] === 2 && __DATAVISOOL_REMOTE_COMPONENT_TEMP__.update.x.p === 9", "check", 1, null);
                assertEquals(Boolean.TRUE, result);
            }
        } finally {
            Files.deleteIfExists(file);
        }
    }

    @Test
    public void rejectsUnverifiableUtilityAliasesAndMembers() throws Exception {
        for (String body : new String[]{"return U.ObjectUtil", "return U.ObjectUtil.merge", "return U.ObjectUtil.unknown()"}) {
            Path file = Files.createTempFile("component-", ".js");
            try {
                Files.writeString(file, "var __LIGHT_CHASER_REMOTE_COMPONENT_TEMP__=function(U){" + body + "}(LightChaserUtil);", StandardCharsets.UTF_8);
                assertThrows(IllegalArgumentException.class, () -> LegacyComponentImportGuard.validate(file, "example.js"));
            } finally {
                Files.deleteIfExists(file);
            }
        }
    }

    @Test
    public void rejectsHiddenLegacyReferencesAndDynamicGlobalAccess() throws Exception {
        for (String body : new String[]{"return window.__\\u004cIGHT_CHASER_REMOTE_COMPONENT_TEMP__", "return window['Light'+'ChaserUtil']", "return `\\u004cightChaserUtil`"}) {
            Path file = Files.createTempFile("component-", ".js");
            try {
                Files.writeString(file, "var __LIGHT_CHASER_REMOTE_COMPONENT_TEMP__=function(U){" + body + "}(LightChaserUtil);", StandardCharsets.UTF_8);
                assertThrows(IllegalArgumentException.class, () -> LegacyComponentImportGuard.validate(file, "example.js"));
            } finally {
                Files.deleteIfExists(file);
            }
        }
    }

    @Test
    public void acceptsCurrentRuntimeNames() throws Exception {
        Path file = Files.createTempFile("component-", ".js");
        try {
            Files.writeString(file, "window.__DATAVISOOL_REMOTE_COMPONENT_TEMP__ = DataVisoolSDK;", StandardCharsets.UTF_8);
            LegacyComponentImportGuard.validate(file, "new.js");
        } finally {
            Files.deleteIfExists(file);
        }
    }

    @Test
    public void skipsParserForModernScriptsWithOrdinaryEscapesAndLargeFiles() throws Exception {
        Path file = Files.createTempFile("component-modern-", ".js");
        try {
            String modern = "const matcher = /[a&&b]/v; const path = \"C:\\\\tmp\";";
            Files.writeString(file, modern, StandardCharsets.UTF_8);
            assertFalse(LegacyComponentImportGuard.validate(file, "new.js"));
            assertEquals(modern, Files.readString(file));

            String escapedCss = "const style=document.createElement('style');style.style.cssText='.\\\\6c cp-button{}';";
            Files.writeString(file, escapedCss, StandardCharsets.UTF_8);
            assertTrue(LegacyComponentImportGuard.validate(file, "escaped-css.js"));
            assertTrue(Files.readString(file).contains(".datavisool-button{}"));

            String large = "const path = \"C:\\\\tmp\";\n".repeat(400_000);
            assertTrue(large.length() > 4 * 1024 * 1024);
            Files.writeString(file, large, StandardCharsets.UTF_8);
            assertFalse(LegacyComponentImportGuard.validate(file, "large-new.js"));
            assertEquals(large.length(), Files.size(file));

            String modernComment = "// LightChaserUI was only documentation\nconst matcher = /[a&&b]/v;";
            Files.writeString(file, modernComment, StandardCharsets.UTF_8);
            assertFalse(LegacyComponentImportGuard.validate(file, "modern-comment.js"));
            assertEquals(modernComment, Files.readString(file));

            String modernText = "const note=\"className:'lcp-button'\";const matcher=/[a&&b]/v;";
            Files.writeString(file, modernText, StandardCharsets.UTF_8);
            assertFalse(LegacyComponentImportGuard.validate(file, "modern-text.js"));
            assertEquals(modernText, Files.readString(file));

            String longIdentifier = "a".repeat(4 * 1024 * 1024 + 100);
            Files.writeString(file, longIdentifier, StandardCharsets.UTF_8);
            assertFalse(LegacyComponentImportGuard.validate(file, "long-identifier.js"));

            String multilineComment = "/*" + "\n".repeat(4 * 1024 * 1024 + 100) + "*/const value=1;";
            Files.writeString(file, multilineComment, StandardCharsets.UTF_8);
            assertFalse(LegacyComponentImportGuard.validate(file, "multiline-comment.js"));

            String templateApi = "const text=`" + "x".repeat(4 * 1024 * 1024 + 100) + "${LCPSDK.value}`;";
            Files.writeString(file, templateApi, StandardCharsets.UTF_8);
            IllegalArgumentException templateError = assertThrows(IllegalArgumentException.class,
                    () -> LegacyComponentImportGuard.validate(file, "template-api.js"));
            assertTrue(templateError.getMessage().contains("大小限制"));

            String divisionApi = " ".repeat(4 * 1024 * 1024 + 100) + "const n=2;n // comment\n / LCPSDK.value / 2;";
            Files.writeString(file, divisionApi, StandardCharsets.UTF_8);
            IllegalArgumentException divisionError = assertThrows(IllegalArgumentException.class,
                    () -> LegacyComponentImportGuard.validate(file, "division-api.js"));
            assertTrue(divisionError.getMessage().contains("大小限制"));
        } finally {
            Files.deleteIfExists(file);
        }
    }

    @Test
    public void ignoresLegacyNamesInCommentsButNotInCode() throws Exception {
        Path file = Files.createTempFile("component-", ".js");
        try {
            String current = "// LightChaserUtil was used by an earlier version\nwindow.__DATAVISOOL_REMOTE_COMPONENT_TEMP__ = DataVisoolSDK;";
            Files.writeString(file, current, StandardCharsets.UTF_8);
            assertFalse(LegacyComponentImportGuard.validate(file, "new.js"));
            assertEquals(current, Files.readString(file));

            String legacy = "// Keep the LightChaserUI note\nvar __LIGHT_CHASER_REMOTE_COMPONENT_TEMP__=function(V){return V.LCGUI}(LightChaserUI);";
            Files.writeString(file, legacy, StandardCharsets.UTF_8);
            assertTrue(LegacyComponentImportGuard.validate(file, "legacy.js"));
            String converted = Files.readString(file);
            assertTrue(converted.contains("// Keep the LightChaserUI note"));
            assertTrue(converted.contains("V.DatavisoolGUI"));

            String unsupported = "var component = {dependency: LightChaserUtil};";
            Files.writeString(file, unsupported, StandardCharsets.UTF_8);
            assertThrows(IllegalArgumentException.class, () -> LegacyComponentImportGuard.validate(file, "old.js"));
            assertEquals(unsupported, Files.readString(file));
        } finally {
            Files.deleteIfExists(file);
        }
    }

    @Test
    public void convertsLiteralClassNamesAndRejectsAmbiguousReferences() throws Exception {
        Path file = Files.createTempFile("component-", ".js");
        try {
            String prefix = "var __LIGHT_CHASER_REMOTE_COMPONENT_TEMP__=function(V){";
            String suffix = "}(LightChaserUI);";
            String source = prefix + "return [V.LCGUI,{className:'custom lcp-button  lc-dialog'}]" + suffix;
            Files.writeString(file, source, StandardCharsets.UTF_8);
            assertTrue(LegacyComponentImportGuard.validate(file, "old.js"));
            String converted = Files.readString(file);
            assertTrue(converted.contains("className:\"custom datavisool-button  datavisool-dialog\""));

            for (String body : new String[]{"return [V.LCGUI, getClass('lcp-button')]", "return [V.LCGUI, `lcp-button`]", "return [V.LCGUI, {className: condition ? 'lcp-button' : 'other'}]"}) {
                String ambiguous = prefix + body + suffix;
                Files.writeString(file, ambiguous, StandardCharsets.UTF_8);
                IllegalArgumentException error = assertThrows(IllegalArgumentException.class,
                        () -> LegacyComponentImportGuard.validate(file, "old.js"));
                assertTrue(error.getMessage().contains("旧 UI 类名"));
                assertEquals(ambiguous, Files.readString(file));
            }
        } finally {
            Files.deleteIfExists(file);
        }
    }

    @Test
    public void convertsLegacyEntryEvenWithoutLegacySdkDependencies() throws Exception {
        Path file = Files.createTempFile("component-", ".js");
        try {
            for (String source : new String[]{
                    "var __LIGHT_CHASER_REMOTE_COMPONENT_TEMP__=function(){return {name:'plain'}}();",
                    "var __LIGHT_CHASER_REMOTE_COMPONENT_TEMP__=function(R){return R.createElement('div',{className:'lcp-button'})}(React);"}) {
                Files.writeString(file, source, StandardCharsets.UTF_8);
                assertTrue(LegacyComponentImportGuard.validate(file, "old.js"));
                String converted = Files.readString(file);
                assertTrue(converted.contains("__DATAVISOOL_REMOTE_COMPONENT_TEMP__"));
                assertFalse(converted.contains("__LIGHT_CHASER_REMOTE_COMPONENT_TEMP__"));
                if (source.contains("lcp-button")) assertTrue(converted.contains("datavisool-button"));
            }
        } finally {
            Files.deleteIfExists(file);
        }
    }

    @Test
    public void convertsStaticInlineCssButPreservesOrdinaryStrings() throws Exception {
        Path file = Files.createTempFile("component-inline-style-", ".js");
        try {
            String source = "const style=document.createElement('style');" +
                    "style.style.cssText='.\\\\6c cp-button{--lcp-scrollbar-thumb:var(--lcp-scrollbar-thumb)}';" +
                    "const note='A custom .ordinary-button string';";
            Files.writeString(file, source, StandardCharsets.UTF_8);
            assertTrue(LegacyComponentImportGuard.validate(file, "style.js"));
            String converted = Files.readString(file);
            assertTrue(converted.contains(".datavisool-button{--datavisool-scrollbar-thumb:var(--datavisool-scrollbar-thumb)}"));
            assertTrue(converted.contains("A custom .ordinary-button string"));

            String reactStyle = "var __LIGHT_CHASER_REMOTE_COMPONENT_TEMP__=function(R,U){" +
                    "return [U.LCGUI,R.createElement('style',null,`.cm-s-lcp-dark{color:red}`)];" +
                    "}(React,LightChaserUI);";
            Files.writeString(file, reactStyle, StandardCharsets.UTF_8);
            assertTrue(LegacyComponentImportGuard.validate(file, "react-style.js"));
            assertTrue(Files.readString(file).contains(".cm-s-datavisool-dark{color:red}"));

            String innerText = "const styleEl=document.createElement('style');styleEl.innerText='.lcp-button{color:rgb(1,2,3)}';" +
                    "document.head.appendChild(styleEl);document.querySelector('body');document.getElementById('target');";
            Files.writeString(file, innerText, StandardCharsets.UTF_8);
            assertTrue(LegacyComponentImportGuard.validate(file, "inner-text.js"));
            assertTrue(Files.readString(file).contains("innerText=\".datavisool-button{color:rgb(1,2,3)}\""));

            StringBuilder manyStyles = new StringBuilder();
            for (int i = 0; i < 70; i++) {
                manyStyles.append("const styleEl").append(i).append("=document.createElement('style');")
                        .append("styleEl").append(i).append(".innerText='.lcp-button{color:red}';")
                        .append("document.head.appendChild(styleEl").append(i).append(");");
            }
            Files.writeString(file, manyStyles, StandardCharsets.UTF_8);
            assertTrue(LegacyComponentImportGuard.validate(file, "many-inline-styles.js"));
            assertTrue(Files.readString(file).contains("styleEl69.innerText=\".datavisool-button{color:red}\""));

            String appendStyles = "const styleA=document.createElement('style');styleA.innerText='.lcp-button{color:red}';" +
                    "const styleB=document.createElement('style');styleB.innerText='.lcp-checkbox{color:blue}';document.head.append(styleA,styleB);";
            Files.writeString(file, appendStyles, StandardCharsets.UTF_8);
            assertTrue(LegacyComponentImportGuard.validate(file, "append-styles.js"));
            assertTrue(Files.readString(file).contains("document.head.append(styleA,styleB)"));

            String localWindowShadow = "function unrelated(window){return window.location;}" +
                    "const styleEl=document.createElement('style');styleEl.innerText='.lcp-button{}';document.head.append(styleEl);";
            Files.writeString(file, localWindowShadow, StandardCharsets.UTF_8);
            assertTrue(LegacyComponentImportGuard.validate(file, "unrelated-window-shadow.js"));
            assertTrue(Files.readString(file).contains(".datavisool-button{}"));

            String typeofGuards = "if(typeof window!=='undefined'){window.setTimeout(()=>{},0);}if(typeof document!=='undefined'){}" +
                    "const styleEl=document.createElement('style');styleEl.innerText='.lcp-button{}';document.head.append(styleEl);";
            Files.writeString(file, typeofGuards, StandardCharsets.UTF_8);
            assertTrue(LegacyComponentImportGuard.validate(file, "typeof-global-guards.js"));

            String instanceofTypes = "const isElement=node instanceof window.Element;const isDocument=node instanceof Document;" +
                    "const styleEl=document.createElement('style');styleEl.innerText='.lcp-button{}';document.head.append(styleEl);";
            Files.writeString(file, instanceofTypes, StandardCharsets.UTF_8);
            assertTrue(LegacyComponentImportGuard.validate(file, "instanceof-global-types.js"));

            String objectPrototypeRead = "const hasOwn=Object.prototype.hasOwnProperty.call({x:1},'x');" +
                    "const styleEl=document.createElement('style');styleEl.innerText='.lcp-button{}';document.head.append(styleEl);";
            Files.writeString(file, objectPrototypeRead, StandardCharsets.UTF_8);
            assertTrue(LegacyComponentImportGuard.validate(file, "ordinary-object-prototype.js"));

            String instanceofChecks = "const hasOwn=Object.prototype.hasOwnProperty.call({x:1},'x');" +
                    "const isElement=node instanceof window.Element;const isDocument=node instanceof Document;" +
                    "const styleEl=document.createElement('style');styleEl.innerText='.lcp-button{}';document.head.append(styleEl);";
            Files.writeString(file, instanceofChecks, StandardCharsets.UTF_8);
            assertTrue(LegacyComponentImportGuard.validate(file, "instanceof-global-types.js"));
            assertTrue(Files.readString(file).contains(".datavisool-button{}"));

            for (String ambiguous : new String[]{
                    "function f(document){const styleEl=document.createElement('style');styleEl.innerText='.lcp-button{}';document.head.appendChild(styleEl);}",
                    "document.createElement=function(){return {};};const styleEl=document.createElement('style');styleEl.innerText='.lcp-button{}';",
                    "document.head.appendChild=function(){};const styleEl=document.createElement('style');styleEl.innerText='.lcp-button{}';document.head.appendChild(styleEl);",
                    "const styleEl=document.createElement('style');styleEl.innerText='.lcp-button{}';document.querySelector('body').ownerDocument.createElement=function(){};document.head.appendChild(styleEl);",
                    "const styleEl=document.createElement('style');styleEl.innerText='.lcp-button{}';globalThis.document.createElement=function(){};",
                    "const styleEl=document.createElement('style');styleEl.innerText='.lcp-button{}';window['document'].createElement=function(){};",
                    "const styleEl=document.createElement('style');styleEl.innerText='.lcp-button{}';const w=window;w.document.createElement=function(){};",
                    "const styleEl=document.createElement('style');styleEl.innerText='.lcp-button{}';parent.document.createElement=function(){};",
                    "const styleEl=document.createElement('style');styleEl.innerText='.lcp-button{}';self.document.createElement=function(){};",
                    "const styleEl=document.createElement('style');styleEl.innerText='.lcp-button{}';top.document.createElement=function(){};",
                    "const styleEl=document.createElement('style');styleEl.innerText='.lcp-button{}';this.document.createElement=function(){};",
                    "const styleEl=document.createElement('style');styleEl.innerText='.lcp-button{}';window[key].createElement=function(){};",
                    "const styleEl=document.createElement('style');styleEl.innerText='.lcp-button{}';Node.prototype.appendChild=function(){};",
                    "const styleEl=document.createElement('style');styleEl.innerText='.lcp-button{}';Element.prototype.append=function(){};",
                    "const styleEl=document.createElement('style');styleEl.innerText='.lcp-button{}';Document.prototype.createElement=function(){};",
                    "HTMLStyleElement.prototype.innerText=function(){};const styleEl=document.createElement('style');styleEl.innerText='.lcp-button{}';document.head.append(styleEl);",
                    "window.HTMLStyleElement.prototype.innerText=function(){};const styleEl=document.createElement('style');styleEl.innerText='.lcp-button{}';document.head.append(styleEl);",
                    "Object.defineProperty(window.HTMLStyleElement.prototype,'innerText',{set:function(){}});const styleEl=document.createElement('style');styleEl.innerText='.lcp-button{}';document.head.append(styleEl);",
                    "Reflect.set(window.HTMLStyleElement.prototype,'innerText',function(){});const styleEl=document.createElement('style');styleEl.innerText='.lcp-button{}';document.head.append(styleEl);",
                    "const el=document.createElement('style');const T=el.constructor;T.prototype.innerText=function(){};const styleEl=document.createElement('style');styleEl.innerText='.lcp-button{}';document.head.append(styleEl);",
                    "const styleEl=document.createElement('style');styleEl.innerText='.lcp-button{}';const proto=Element.prototype;proto.appendChild=function(){};",
                    "const styleEl=document.createElement('style');styleEl.innerText='.lcp-button{}';const E=window.Element;E.prototype.append=function(){};",
                    "const proto=Object.getPrototypeOf(Object.getPrototypeOf(document.createElement('div')));proto.innerText=function(){};const styleEl=document.createElement('style');styleEl.innerText='.lcp-button{}';document.head.append(styleEl);",
                    "const proto=document.createElement('div').__proto__.__proto__;proto.innerText=function(){};const styleEl=document.createElement('style');styleEl.innerText='.lcp-button{}';document.head.append(styleEl);"
            }) {
                Files.writeString(file, ambiguous, StandardCharsets.UTF_8);
                assertThrows(IllegalArgumentException.class, () -> LegacyComponentImportGuard.validate(file, "ambiguous-document.js"));
                assertEquals(ambiguous, Files.readString(file));
            }
        } finally {
            Files.deleteIfExists(file);
        }
    }

    @Test
    public void rejectsAmbiguousPartiallyMatchedClassSelectors() throws Exception {
        Path file = Files.createTempFile("component-partial-class-selector-", ".css");
        try {
            for (String operator : new String[]{"*=", "^=", "$=", "|="}) {
                String source = "[class " + operator + " 'lcp-button'] { color: red }";
                Files.writeString(file, source, StandardCharsets.UTF_8);
                IllegalArgumentException error = assertThrows(IllegalArgumentException.class,
                        () -> LegacyComponentImportGuard.validateLegacyStyles(file, "partial.css"));
                assertTrue(error.getMessage(), error.getMessage().contains("属性选择器中的旧 UI 名称"));
                assertEquals(source, Files.readString(file));
            }
        } finally {
            Files.deleteIfExists(file);
        }
    }

    @Test
    public void rejectsDynamicAndUnrecognizedInlineCssLocations() throws Exception {
        Path file = Files.createTempFile("component-inline-style-", ".js");
        try {
            String dynamic = "const style=document.createElement('style');style.style.cssText=`.lcp-button{color:${color}}`;";
            Files.writeString(file, dynamic, StandardCharsets.UTF_8);
            assertThrows(IllegalArgumentException.class, () -> LegacyComponentImportGuard.validate(file, "dynamic-style.js"));
            assertEquals(dynamic, Files.readString(file));

            String unrecognized = "const widget={createElement:function(){}};widget.createElement('style',null,'.lcp-button{}');";
            Files.writeString(file, unrecognized, StandardCharsets.UTF_8);
            assertThrows(IllegalArgumentException.class, () -> LegacyComponentImportGuard.validate(file, "unknown-style.js"));
            assertEquals(unrecognized, Files.readString(file));

            String arrayText = "const values=['[class=lcp-button]{}'];";
            Files.writeString(file, arrayText, StandardCharsets.UTF_8);
            assertThrows(IllegalArgumentException.class, () -> LegacyComponentImportGuard.validate(file, "array-style-text.js"));
            assertEquals(arrayText, Files.readString(file));
        } finally {
            Files.deleteIfExists(file);
        }
    }

    @Test
    public void convertsTextAssignedToProvenStyleElementAndRejectsAmbiguousBindings() throws Exception {
        Path file = Files.createTempFile("component-style-text-", ".js");
        try {
            String textContent = "const styleEl=document.createElement('style');styleEl.textContent='.\\\\6c cp-button{}';";
            Files.writeString(file, textContent, StandardCharsets.UTF_8);
            assertTrue(LegacyComponentImportGuard.validate(file, "text-content.js"));
            assertTrue(Files.readString(file).contains(".datavisool-button{}"));

            String innerHtml = "const styleEl=document.createElement(\"style\");styleEl.innerHTML='[class~=lcp-button]{}';";
            Files.writeString(file, innerHtml, StandardCharsets.UTF_8);
            assertTrue(LegacyComponentImportGuard.validate(file, "inner-html.js"));
            assertTrue(Files.readString(file).contains("[class~=datavisool-button]{}"));

            for (String source : new String[]{
                    "let styleEl=document.createElement('style');styleEl.textContent='.lcp-button{}';",
                    "const styleEl=document.createElement('div');styleEl.textContent='.lcp-button{}';",
                    "const styleEl=document.createElement('style');styleEl.textContent='.lcp-button{}';styleEl=document.createElement('style');",
                    "const styleEl=document.createElement('style');function set(styleEl){styleEl.textContent='.lcp-button{}';}"
            }) {
                Files.writeString(file, source, StandardCharsets.UTF_8);
                assertThrows(IllegalArgumentException.class, () -> LegacyComponentImportGuard.validate(file, "ambiguous-style.js"));
                assertEquals(source, Files.readString(file));
            }
        } finally {
            Files.deleteIfExists(file);
        }
    }

    @Test
    public void convertsClassNameWithoutLegacySdkAndLeavesTextAndResourceUrlsAlone() throws Exception {
        Path file = Files.createTempFile("component-class-name-", ".js");
        try {
            String source = "const view={className:'custom lcp-button'};const editor={className:'cm-s-lcp-dark'};" +
                    "const message='lcp-button is mentioned in normal text';const icon='/assets/lcp-button.svg';";
            Files.writeString(file, source, StandardCharsets.UTF_8);
            assertTrue(LegacyComponentImportGuard.validate(file, "class-name.js"));
            String converted = Files.readString(file);
            assertTrue(converted.contains("className:\"custom datavisool-button\""));
            assertTrue(converted.contains("className:\"cm-s-datavisool-dark\""));
            assertTrue(converted.contains("lcp-button is mentioned in normal text"));
            assertTrue(converted.contains("/assets/lcp-button.svg"));

            String escaped = "const style=document.createElement('style');style.style.cssText='.lc\\\\70 -button{--lc\\\\70 -scrollbar-thumb:red}.lcp\\\\2d button{color:red}';";
            Files.writeString(file, escaped, StandardCharsets.UTF_8);
            assertTrue(LegacyComponentImportGuard.validate(file, "escaped-prefix.js"));
            String escapedConverted = Files.readString(file);
            assertTrue(escapedConverted.contains(".datavisool-button{--datavisool-scrollbar-thumb:red}"));
            assertTrue(escapedConverted.contains(".datavisool-button{color:red}"));

            String staticTemplate = "const view={className:`custom lcp-button`};";
            Files.writeString(file, staticTemplate, StandardCharsets.UTF_8);
            assertTrue(LegacyComponentImportGuard.validate(file, "template-class-name.js"));
            assertTrue(Files.readString(file), Files.readString(file).contains("className:\"custom datavisool-button\""));

            for (String ambiguous : new String[]{
                    "const view={className: condition ? 'lcp-button' : 'other'};",
                    "const view={className:`lcp-button ${suffix}`};",
                    "const name=getClass('lcp-button');"
            }) {
                assertTrue("candidate: " + ambiguous, LegacyUiStyleConverter.containsLegacyStyleCandidate(ambiguous));
                Files.writeString(file, ambiguous, StandardCharsets.UTF_8);
                assertThrows(ambiguous, IllegalArgumentException.class, () -> LegacyComponentImportGuard.validate(file, "ambiguous-class-name.js"));
                assertEquals(ambiguous, Files.readString(file));
            }
        } finally {
            Files.deleteIfExists(file);
        }
    }

    @Test
    public void convertsPublishedLegacyCliAssetBootstrap() throws Exception {
        Path file = Files.createTempFile("component-", ".js");
        try (var input = getClass().getResourceAsStream("/fixtures/legacy-cli-component.js")) {
            assertNotNull(input);
            String source = new String(input.readAllBytes(), StandardCharsets.UTF_8);
            Files.writeString(file, source, StandardCharsets.UTF_8);
            assertTrue(LegacyComponentImportGuard.validate(file, "chart.js"));
            String converted = Files.readString(file);
            assertTrue(converted.contains("globalThis.__DATAVISOOL_REMOTE_COMPONENT_BASE_URL_MAP__"));
            assertTrue(converted.contains("data-datavisool-remote-style"));
            assertTrue(converted.contains("assets/chart.css"));
            assertTrue(converted.contains("__LCP_REMOTE_ASSET_URL__(\"assets/icon.svg\")"));
            assertTrue(converted.contains("__DATAVISOOL_REMOTE_COMPONENT_TEMP__"));
            assertTrue(converted.contains("V.DatavisoolGUI"));

            try (Context context = Context.enter()) {
                context.setClassShutter(className -> false);
                Scriptable scope = context.initSafeStandardObjects();
                context.evaluateString(scope, "var globalThis=this, React={}, DataVisoolUI={DatavisoolGUI:1};" +
                        "var __DATAVISOOL_REMOTE_COMPONENT_BASE_URL_MAP__={'chart.js':'https://example.test/pkg/'};" +
                        "var document={currentScript:{src:'https://example.test/pkg/chart.js'},querySelector:function(){return null}," +
                        "createElement:function(){return {setAttribute:function(){}}},head:{appendChild:function(link){globalThis.link=link}}};", "fixture-setup", 1, null);
                // This executes only the synthetic fixture, never imported user code.
                context.evaluateString(scope, converted, "fixture", 1, null);
                assertEquals("https://example.test/pkg/assets/icon.svg", Context.toString(context.evaluateString(scope, "__DATAVISOOL_REMOTE_COMPONENT_TEMP__.icon", "check", 1, null)));
                assertEquals("https://example.test/pkg/assets/chart.css", Context.toString(context.evaluateString(scope, "link.href", "check", 1, null)));
            }

            String altered = source.replace("document.currentScript", "document.otherScript");
            Files.writeString(file, altered, StandardCharsets.UTF_8);
            assertThrows(IllegalArgumentException.class, () -> LegacyComponentImportGuard.validate(file, "chart.js"));
            assertEquals(altered, Files.readString(file));
        } finally {
            Files.deleteIfExists(file);
        }
    }

    @Test
    public void convertsComponentActuallyBuiltByLegacyCli() throws Exception {
        Path file = Files.createTempFile("component-", ".js");
        try (var input = getClass().getResourceAsStream("/fixtures/legacy-cli-built-component.js")) {
            assertNotNull(input);
            Files.write(file, input.readAllBytes());
            assertTrue(LegacyComponentImportGuard.validate(file, "sample.js"));
            String converted = Files.readString(file);
            assertFalse(converted.contains("__LIGHT_CHASER_REMOTE_COMPONENT_TEMP__"));
            assertTrue(converted.contains("globalThis.__DATAVISOOL_REMOTE_COMPONENT_TEMP__"));
            assertTrue(converted.contains("DataVisoolUI"));
            try (Context context = Context.enter()) {
                context.setClassShutter(className -> false);
                Scriptable scope = context.initSafeStandardObjects();
                context.evaluateString(scope, "var globalThis=this, React={createElement:function(component,props){return props.children}}, DataVisoolUI={Button:function(){}};", "fixture-setup", 1, null);
                // The fixture was built from our own synthetic component.
                context.evaluateString(scope, converted, "fixture", 1, null);
                assertEquals("Example", Context.toString(context.evaluateString(scope, "__DATAVISOOL_REMOTE_COMPONENT_TEMP__()", "check", 1, null)));
            }
        } finally {
            Files.deleteIfExists(file);
        }
    }

    @Test
    public void convertsLegacyDesktopSdkAndTypesFromActualCliOutput() throws Exception {
        Path file = Files.createTempFile("component-", ".js");
        try (var input = getClass().getResourceAsStream("/fixtures/legacy-cli-sdk-component.js")) {
            assertNotNull(input);
            Files.write(file, input.readAllBytes());
            assertTrue(LegacyComponentImportGuard.validate(file, "sample.js"));
            String converted = Files.readString(file);
            assertFalse(converted.contains("LCPSDK"));
            assertFalse(converted.contains("LCPTypes"));
            assertTrue(converted.contains("DataVisoolSDK,DataVisoolTypes"));
            try (Context context = Context.enter()) {
                context.setClassShutter(className -> false);
                Scriptable scope = context.initSafeStandardObjects();
                context.evaluateString(scope, "var globalThis=this, React={createElement:function(component,props){return props.children}}," +
                        "DataVisoolUI={Button:function(){}}, DataVisoolTypes={DesignerMode:{EDIT:'edit'}}," +
                        "DataVisoolSDK={ObjectUtil:{merge:function(a,b){a.name=b.name;return a}}};", "fixture-setup", 1, null);
                context.evaluateString(scope, converted, "fixture", 1, null);
                assertEquals("Example", Context.toString(context.evaluateString(scope, "__DATAVISOOL_REMOTE_COMPONENT_TEMP__()", "check", 1, null)));
            }
            for (String dependency : new String[]{"S.UnknownMember", "T.UnknownMember", "T['DesignerMode']"}) {
                String source = "(function(S,T){globalThis.__LIGHT_CHASER_REMOTE_COMPONENT_TEMP__=" + dependency + ";})(LCPSDK,LCPTypes);";
                Files.writeString(file, source, StandardCharsets.UTF_8);
                assertThrows(IllegalArgumentException.class, () -> LegacyComponentImportGuard.validate(file, "bad.js"));
                assertEquals(source, Files.readString(file));
            }
        } finally {
            Files.deleteIfExists(file);
        }
    }
}
