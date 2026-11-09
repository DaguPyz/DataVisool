/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.util;

import com.zsq.datavisoolservice.global.AppException;
import com.zsq.datavisoolservice.global.AppStatusCode;
import com.zsq.datavisoolservice.model.auth.User;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class AppContextUtilTest {
    @AfterEach void clear() { SecurityContextHolder.clearContext(); }

    @Test void rejectsMissingAnonymousAndUnauthenticatedContexts() {
        SecurityContextHolder.clearContext();
        assertEquals(AppStatusCode.UN_LOGGED_IN.code(), assertThrows(AppException.class, AppContextUtil::getCurrentUser).getCode());
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken("anonymousUser", null, List.of()));
        assertEquals(AppStatusCode.UN_LOGGED_IN.code(), assertThrows(AppException.class, AppContextUtil::getCurrentUser).getCode());
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(new User(), null));
        assertEquals(AppStatusCode.UN_LOGGED_IN.code(), assertThrows(AppException.class, AppContextUtil::getCurrentUser).getCode());
    }

    @Test void returnsAuthenticatedUser() {
        User user = new User(); user.setId(7L);
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(user, null, List.of()));
        assertSame(user, AppContextUtil.getCurrentUser());
    }
}
