/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.service.impl.ai;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

class AiAgentServiceCompletionRequirementsTest {
    @Test
    void declarationCanBeCorrectedBeforeWriteAndOnlyExtendedAfterWrite() {
        assertEquals(
                List.of("patchComponents"),
                AiAgentService.mergeCompletionRequirements(
                        List.of("patchComponents"), List.of("createComponents"), false, false)
        );
        assertEquals(
                List.of("createComponents", "patchComponents"),
                AiAgentService.mergeCompletionRequirements(
                        List.of("patchComponents"), List.of("createComponents"), true, false)
        );
    }

    @Test
    void progressOnlyUpdateDoesNotEraseDeclaredEffects() {
        assertEquals(List.of("createComponents"), AiAgentService.mergeCompletionRequirements(
                null, List.of("createComponents"), false, false));
        assertEquals(List.of(), AiAgentService.mergeCompletionRequirements(null, List.of(), false, false));
    }

    @Test
    void styleAndDataShortcutAlwaysRequirePatchEffect() {
        assertEquals(
                List.of("patchComponents"),
                AiAgentService.mergeCompletionRequirements(List.of(), List.of(), false, true)
        );
    }
}
