/*
 * Copyright © 2023-2026 xiaopujun
 * All rights reserved.
 * Licensed under the DataVisool License. See the LICENSE file distributed with this software.
 */

import type {ReactElement} from "react";
import type {RouteObject} from "react-router-dom";

const withRouteErrorElement = (routes: RouteObject[], errorElement: ReactElement): RouteObject[] => {
    return routes.map((route) => {
        const nextRoute: any = {
            ...route,
            errorElement: (route.errorElement as ReactElement | null | undefined) ?? errorElement,
        };
        if (Array.isArray(route.children)) {
            nextRoute.children = withRouteErrorElement(route.children, errorElement);
        }
        return nextRoute as RouteObject;
    });
};

export default withRouteErrorElement;
