/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl;

import org.junit.Test;
import static org.junit.Assert.*;

public class LegacyUiStyleConverterTest {
    @Test public void convertsKnownSelectorsAndVariablesWithoutChangingUserContent() {
        String css = "/* .lcp-button */\n.lcp-button:hover,.lcp-lcgui,.lc-dialog,.lcp-custom-widget,.lcp-button自定义 {" +
                "--lcp-ui-primary: red; width: var(--lcp-slider-thumb-size);" +
                "content: '.lcp-button --lcp-ui-primary'; background: url(/images/.lcp-button--lcp-ui-primary.png);}";
        String expected = "/* .lcp-button */\n.datavisool-button:hover,.datavisool-gui,.datavisool-dialog,.lcp-custom-widget,.lcp-button自定义 {" +
                "--datavisool-ui-primary: red; width: var(--datavisool-slider-thumb-size);" +
                "content: '.lcp-button --lcp-ui-primary'; background: url(/images/.lcp-button--lcp-ui-primary.png);}";
        assertEquals(expected, LegacyUiStyleConverter.convert(css, "component/style.css"));
    }

    @Test public void rejectsAttributeSelectorsThatNeedManualResolution() {
        for (String css : new String[]{"[class*='lcp-'] {color:red}", "[class*=lcp-] {color:red}", "[class*='LCP-' i] {color:red}", "[class~='lcp-button' i] {color:red}", "[data-value=--lcp-ui-primary] {color:red}"}) {
            IllegalArgumentException error = assertThrows(IllegalArgumentException.class,
                    () -> LegacyUiStyleConverter.convert(css, "component/style.css"));
            assertTrue(error.getMessage().contains("component/style.css"));
            assertTrue(error.getMessage().contains("属性选择器"));
        }
    }

    @Test public void convertsExactClassAttributeSelectorsAndPreservesCustomNames() {
        String css = "[class~='lcp-button'],[class~=lc-dialog]," +
                "[class = \"custom lcp-button  lcp-custom\" s] {color:red}";
        String expected = "[class~='datavisool-button'],[class~=datavisool-dialog]," +
                "[class = \"custom datavisool-button  lcp-custom\" s] {color:red}";
        assertEquals(expected, LegacyUiStyleConverter.convert(css, "component/style.css"));
        assertEquals("[class~='datavisool-button'] {color:red}",
                LegacyUiStyleConverter.convert("[class~='lcp-\\62 utton'] {color:red}", "component/style.css"));
    }

    @Test public void convertsExactClassSelectorWithEscapedAttributeName() {
        assertEquals("[class~=datavisool-button] {color:red}",
                LegacyUiStyleConverter.convert("[\\63 lass~=lcp-button] {color:red}", "component/style.css"));
        assertEquals("[ /* keep */ class/* keep */ ~= 'datavisool-button'] {color:red}",
                LegacyUiStyleConverter.convert("[ /* keep */ cl\\61 ss/* keep */ ~= 'lcp-button'] {color:red}", "component/style.css"));
        assertTrue(LegacyUiStyleConverter.containsLegacyStyleCandidate("[\\63 lass~=lcp-button] {color:red}"));
        assertTrue(LegacyUiStyleConverter.containsLegacyStyleCandidate("[cl\\61 ss~=lcp-button] {color:red}"));
        assertTrue(LegacyUiStyleConverter.containsLegacyStyleCandidate("[cl/*x*/\\61 ss~=lcp-button] {color:red}"));
        assertTrue(LegacyUiStyleConverter.containsLegacyStyleCandidate("[\\63 l/*x*/ass~=lcp-button] {color:red}"));
        assertFalse(LegacyUiStyleConverter.containsLegacyStyleCandidate("[data-\\63 lass=lcp-button] {color:red}"));
    }

    @Test public void prefilterSkipsManyUnclosedJavaScriptBracketsAndKeepsOrdinaryCssUnchanged() {
        StringBuilder ordinaryJs = new StringBuilder(20_000);
        for (int i = 0; i < 10_000; i++) ordinaryJs.append('[');
        ordinaryJs.append("const label='plain text';");
        assertFalse(LegacyUiStyleConverter.containsLegacyStyleCandidate(ordinaryJs.toString()));
        assertFalse(LegacyUiStyleConverter.containsLegacyStyleCandidate(".custom-widget { color: red; }"));
        assertTrue(LegacyUiStyleConverter.containsLegacyStyleCandidate(".lcp-button { color: red; }"));
    }

    @Test public void convertsExactClassAttributeSelectorsWithCommentsBetweenTokens() {
        String css = "[ /* before class */ class/* after class */ ~=/* before value */ 'lcp-button' /* ] in comment */] {color:red}";
        String expected = "[ /* before class */ class/* after class */ ~=/* before value */ 'datavisool-button' /* ] in comment */] {color:red}";
        assertEquals(expected, LegacyUiStyleConverter.convert(css, "component/style.css"));
    }

    @Test public void convertsUnquotedClassSelectorWhenEscapeEndsImmediatelyBeforeBracket() {
        assertEquals("[class~=datavisool-button] {color:red}",
                LegacyUiStyleConverter.convert("[class~=lcp-butto\\6e] {color:red}", "component/style.css"));
        assertEquals("[data-key=foo\\]] {color:red}",
                LegacyUiStyleConverter.convert("[data-key=foo\\]] {color:red}", "component/style.css"));
    }

    @Test public void rejectsCommentsThatSplitAnIdentifierInAnExactClassSelector() {
        assertThrows(IllegalArgumentException.class,
                () -> LegacyUiStyleConverter.convert("[cl/* split */ass~='lcp-button'] {color:red}", "component/style.css"));
    }

    @Test public void rejectsEscapedCssInsteadOfRewritingUncertainTokens() {
        assertEquals(".datavisool-button {color:red}",
                LegacyUiStyleConverter.convert(".\\6c cp-button {color:red}", "component/style.css"));
        assertEquals("[class~=\"datavisool-button custom\"] {color:red}",
                LegacyUiStyleConverter.convert("[class~=\"lcp-\\62 utton custom\"] {color:red}", "component/style.css"));
        assertEquals(".datavisool-dialog {content:\\31 23}",
                LegacyUiStyleConverter.convert(".lc\\2d dialog {content:\\31 23}", "component/style.css"));
        assertEquals("[class~=datavisool-button] {color:red}",
                LegacyUiStyleConverter.convert("[class~=lcp-\\62 utton] {color:red}", "component/style.css"));
        assertEquals(".cm-s-datavisool-dark {color:red}",
                LegacyUiStyleConverter.convert(".cm-s-lcp-dark {color:red}", "component/style.css"));
        assertEquals(".custom\\:hover {content:\\31 23}",
                LegacyUiStyleConverter.convert(".custom\\:hover {content:\\31 23}", "component/style.css"));
        assertThrows(IllegalArgumentException.class,
                () -> LegacyUiStyleConverter.convert(".lcp-\\75 nknown {color:red}", "component/style.css"));
        assertThrows(IllegalArgumentException.class,
                () -> LegacyUiStyleConverter.convert("[class*=lcp-\\62 utton] {color:red}", "component/style.css"));
        assertThrows(IllegalArgumentException.class,
                () -> LegacyUiStyleConverter.convert("[class*=lcp-\\22 button] {color:red}", "component/style.css"));
        assertThrows(IllegalArgumentException.class,
                () -> LegacyUiStyleConverter.convert("[class~=lcp-\\75 nknown] {color:red}", "component/style.css"));
        assertThrows(IllegalArgumentException.class,
                () -> LegacyUiStyleConverter.convert("[class~=\"lcp-button\\20 custom\"] {color:red}", "component/style.css"));
        assertThrows(IllegalArgumentException.class,
                () -> LegacyUiStyleConverter.convert(".a { --lcp-\\75 nknown: red; }", "component/style.css"));
        assertThrows(IllegalArgumentException.class,
                () -> LegacyUiStyleConverter.convert(".a { width: var(--lcp-\\75 nknown); }", "component/style.css"));
        assertThrows(IllegalArgumentException.class,
                () -> LegacyUiStyleConverter.convert(".lcp-\\\nbutton {color:red}", "component/style.css"));
    }

    @Test public void preservesCustomDataTokensButConvertsVariableReferences() {
        String css = "@property --lcp-ui-primary {syntax:'<color>';inherits:true;}" +
                ".lcp-button {--user-data: .lcp-button --lcp-ui-primary var(--lcp-ui-primary);" +
                "animation-name: --lcp-ui-primary;}";
        String expected = "@property --datavisool-ui-primary {syntax:'<color>';inherits:true;}" +
                ".datavisool-button {--user-data: .lcp-button --lcp-ui-primary var(--datavisool-ui-primary);" +
                "animation-name: --lcp-ui-primary;}";
        assertEquals(expected, LegacyUiStyleConverter.convert(css, "component/style.css"));
    }

    @Test public void preservesCommentsInsideVariableSyntax() {
        String css = ".lcp-button { --lcp-ui-primary/**/: red; color: var(/* comment */--lcp-ui-primary); }";
        String expected = ".datavisool-button { --datavisool-ui-primary/**/: red; color: var(/* comment */--datavisool-ui-primary); }";
        assertEquals(expected, LegacyUiStyleConverter.convert(css, "component/style.css"));
    }

    @Test public void scansRepeatedLegacyClassStringsInLinearSegments() {
        String source = "x='lcp-button';".repeat(100_000);
        assertFalse(LegacyUiStyleConverter.containsLegacyStyleCandidate(source));
    }

    @Test public void preservesDataInOrdinaryValuesAndStillConvertsNestedSelectors() {
        String css = "button:hover .lcp-button {content: var(--missing, .lcp-button);" +
                "font-family: .lcp-button; animation-name: --lcp-ui-primary:custom;}" +
                "@media (min-width: 1px) {a:focus .lcp-button {color:var(--lcp-ui-primary)}}";
        String expected = "button:hover .datavisool-button {content: var(--missing, .lcp-button);" +
                "font-family: .lcp-button; animation-name: --lcp-ui-primary:custom;}" +
                "@media (min-width: 1px) {a:focus .datavisool-button {color:var(--datavisool-ui-primary)}}";
        assertEquals(expected, LegacyUiStyleConverter.convert(css, "component/style.css"));
    }

    @Test public void convertsCustomPropertyNamesInContainerStyleQueries() {
        String css = "/* note */ @container panel style(/* note */--lcp-ui-primary: red) {" +
                ".lcp-button {color: var(--lcp-ui-primary); content: style(--lcp-ui-primary: red)}}";
        String expected = "/* note */ @container panel style(/* note */--datavisool-ui-primary: red) {" +
                ".datavisool-button {color: var(--datavisool-ui-primary); content: style(--lcp-ui-primary: red)}}";
        assertEquals(expected, LegacyUiStyleConverter.convert(css, "component/style.css"));
    }
}
