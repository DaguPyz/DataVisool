/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
package com.zsq.datavisoolservice.global;

/** A known, user-actionable failure while converting a component from a project package. */
public class ProjectComponentConversionException extends RuntimeException {
    public ProjectComponentConversionException(String componentName, IllegalArgumentException cause) {
        super("导入失败：组件「" + componentName + "」无法转换：" + cause.getMessage(), cause);
    }
}
