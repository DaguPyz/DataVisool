/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
import {useEffect, useState} from "react";
import {subscribeLocaleChange} from "@/i18n/miniI18n.ts";

export const useLocaleVersion = (): number => {
    const [version, setVersion] = useState(0);

    useEffect(() => subscribeLocaleChange(() => {
        setVersion((current) => current + 1);
    }), []);

    return version;
};
