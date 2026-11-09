<!-- Licensed under the DataVisool License. See the LICENSE file distributed with this software. -->
# G2Plot 公共配置片段

## 画布与通用能力

### 画布基础

<g2plot-canvas>
{
  "padding": "number | array | auto，设置画布内边距，例如 16、[16, 8, 16, 8] 或 auto",
  "appendPadding": "number | array，设置额外画布内边距，例如 16 或 [16, 8, 16, 8]",
  "limitInPlot": "boolean，控制图形是否裁剪在绘图区域内",
  "supportCSSTransform": "boolean，控制 CSS transform 场景下交互事件是否生效"
}
<g2plot-canvas>

### 标注配置

<g2plot-annotations>
{
  "annotations": "array，设置辅助标注，仅允许 JSON 可序列化的标注对象，不支持回调函数"
}
<g2plot-annotations>

### 曲线平滑

<g2plot-smooth>
{
  "smooth": "boolean，控制曲线是否平滑"
}
<g2plot-smooth>

## 坐标轴与标题

### 坐标轴基础配置

<g2plot-axis>
{
  "alias": "string，设置坐标字段别名，常用于默认轴标题",
  "range": "array，设置坐标轴比例尺的映射范围，例如 [0, 1]",
  "tickCount": "number: 0-50，设置坐标轴刻度数量",
  "tickInterval": "number: 0-1000000，设置坐标轴刻度间隔",
  "nice": "boolean，控制坐标轴刻度是否自动优化",
  "min": "number，设置坐标轴最小值",
  "max": "number，设置坐标轴最大值",
  "minLimit": "number，设置坐标轴最小值限定",
  "maxLimit": "number，设置坐标轴最大值限定",
  "top": "boolean，控制坐标轴是否渲染在画布顶层",
  "position": "top | bottom | left | right，设置坐标轴显示位置",
  "verticalLimitLength": "number: 0-1000，设置坐标轴标签垂直方向最大限制长度",
  "verticalFactor": "number: -1-1，设置坐标轴标签方向因子",
  "animate": "boolean，控制坐标轴动画",
  "label": {
    "offset": "number: -100-100，设置坐标轴刻度标签相对轴线偏移",
    "offsetX": "number: -100-100，设置坐标轴刻度标签水平偏移",
    "offsetY": "number: -100-100，设置坐标轴刻度标签垂直偏移",
    "rotate": "number: -6.2832-6.2832，设置坐标轴刻度标签旋转弧度",
    "autoRotate": "boolean，控制坐标轴刻度标签是否自动旋转",
    "autoHide": "boolean，控制坐标轴刻度标签是否自动隐藏防重叠",
    "autoEllipsis": "boolean，控制坐标轴刻度标签是否自动省略",
    "style": {
      "fill": "color，设置坐标轴刻度标签文字颜色",
      "fontSize": "number: 8-48，设置坐标轴刻度标签字号",
      "fontWeight": "number: 100-900，设置坐标轴刻度标签字重",
      "opacity": "number: 0-1，设置坐标轴刻度标签透明度",
      "textAlign": "left | center | right | start | end，设置坐标轴刻度标签水平对齐",
      "textBaseline": "top | middle | bottom，设置坐标轴刻度标签基线"
    }
  },
  "line": {
    "style": {
      "stroke": "color，设置坐标轴轴线颜色",
      "lineWidth": "number: 0-10，设置坐标轴轴线宽度",
      "lineDash": "array，设置坐标轴轴线虚线，例如 [4, 4]",
      "opacity": "number: 0-1，设置坐标轴轴线透明度"
    }
  },
  "grid": {
    "alternateColor": "color，设置坐标轴相邻网格区域交替填充色",
    "closed": "boolean，控制坐标轴网格线是否闭合",
    "alignTick": "boolean，控制坐标轴网格线是否对齐刻度",
    "line": {
      "type": "line | circle，设置坐标轴网格线类型",
      "style": {
        "stroke": "color，设置坐标轴网格线颜色",
        "lineWidth": "number: 0-10，设置坐标轴网格线宽度",
        "lineDash": "array，设置坐标轴网格线虚线，例如 [4, 4]",
        "opacity": "number: 0-1，设置坐标轴网格线透明度"
      }
    }
  },
  "tickLine": {
    "alignTick": "boolean，控制坐标轴刻度线是否对齐刻度",
    "length": "number: 0-50，设置坐标轴刻度线长度",
    "style": {
      "stroke": "color，设置坐标轴刻度线颜色",
      "lineWidth": "number: 0-10，设置坐标轴刻度线宽度",
      "lineDash": "array，设置坐标轴刻度线虚线，例如 [4, 4]",
      "opacity": "number: 0-1，设置坐标轴刻度线透明度"
    }
  },
  "subTickLine": {
    "count": "number: 0-20，设置坐标轴子刻度数量",
    "length": "number: 0-50，设置坐标轴子刻度线长度",
    "style": {
      "stroke": "color，设置坐标轴子刻度线颜色",
      "lineWidth": "number: 0-10，设置坐标轴子刻度线宽度",
      "lineDash": "array，设置坐标轴子刻度线虚线，例如 [2, 2]",
      "opacity": "number: 0-1，设置坐标轴子刻度线透明度"
    }
  },
  "title": {
    "text": "string，设置坐标轴标题文本",
    "offset": "number: -100-100，设置坐标轴标题距离轴线偏移",
    "spacing": "number: 0-100，设置坐标轴标题距离轴标签间距",
    "autoRotate": "boolean，控制坐标轴标题是否自动旋转",
    "rotation": "number: -6.2832-6.2832，设置坐标轴标题旋转弧度",
    "position": "start | center | end，设置坐标轴标题位置",
    "style": {
      "fill": "color，设置坐标轴标题文字颜色",
      "fontSize": "number: 8-48，设置坐标轴标题字号",
      "fontWeight": "number: 100-900，设置坐标轴标题字重",
      "opacity": "number: 0-1，设置坐标轴标题透明度",
      "textAlign": "left | center | right | start | end，设置坐标轴标题水平对齐",
      "textBaseline": "top | middle | bottom，设置坐标轴标题基线"
    }
  }
}
<g2plot-axis>

### 坐标轴扩展配置

<g2plot-axis-extended>
{
  "alias": "string，设置坐标字段别名，常用于默认轴标题",
  "range": "array，设置坐标轴比例尺的映射范围，例如 [0, 1]",
  "tickCount": "number: 0-50，设置坐标轴刻度数量",
  "tickInterval": "number: 0-1000000，设置坐标轴刻度间隔",
  "nice": "boolean，控制坐标轴刻度是否自动优化",
  "min": "number，设置坐标轴最小值",
  "max": "number，设置坐标轴最大值",
  "minLimit": "number，设置坐标轴最小值限定",
  "maxLimit": "number，设置坐标轴最大值限定",
  "top": "boolean，控制坐标轴是否渲染在画布顶层",
  "position": "top | bottom | left | right，设置坐标轴显示位置",
  "verticalLimitLength": "number: 0-1000，设置坐标轴标签垂直方向最大限制长度",
  "verticalFactor": "number: -1-1，设置坐标轴标签方向因子",
  "animate": "boolean，控制坐标轴动画",
  "label": {
    "offset": "number: -100-100，设置坐标轴刻度标签相对轴线偏移",
    "offsetX": "number: -100-100，设置坐标轴刻度标签水平偏移",
    "offsetY": "number: -100-100，设置坐标轴刻度标签垂直偏移",
    "rotate": "number: -6.2832-6.2832，设置坐标轴刻度标签旋转弧度",
    "autoRotate": "boolean，控制坐标轴刻度标签是否自动旋转",
    "autoHide": "boolean，控制坐标轴刻度标签是否自动隐藏防重叠",
    "autoEllipsis": "boolean，控制坐标轴刻度标签是否自动省略",
    "style": {
      "fill": "color，设置坐标轴刻度标签文字颜色",
      "stroke": "color，设置坐标轴刻度标签描边色",
      "lineWidth": "number: 0-10，设置坐标轴刻度标签描边宽度",
      "fontSize": "number: 8-48，设置坐标轴刻度标签字号",
      "fontWeight": "number: 100-900，设置坐标轴刻度标签字重",
      "opacity": "number: 0-1，设置坐标轴刻度标签透明度",
      "textAlign": "left | center | right | start | end，设置坐标轴刻度标签水平对齐",
      "textBaseline": "top | middle | bottom，设置坐标轴刻度标签基线"
    }
  },
  "line": {
    "style": {
      "stroke": "color，设置坐标轴轴线颜色",
      "lineWidth": "number: 0-10，设置坐标轴轴线宽度",
      "lineDash": "array，设置坐标轴轴线虚线，例如 [4, 4]",
      "opacity": "number: 0-1，设置坐标轴轴线透明度"
    }
  },
  "grid": {
    "alternateColor": "color，设置坐标轴相邻网格区域交替填充色",
    "closed": "boolean，控制坐标轴网格线是否闭合",
    "alignTick": "boolean，控制坐标轴网格线是否对齐刻度",
    "line": {
      "type": "line | circle，设置坐标轴网格线类型",
      "style": {
        "stroke": "color，设置坐标轴网格线颜色",
        "lineWidth": "number: 0-10，设置坐标轴网格线宽度",
        "lineDash": "array，设置坐标轴网格线虚线，例如 [4, 4]",
        "opacity": "number: 0-1，设置坐标轴网格线透明度"
      }
    }
  },
  "tickLine": {
    "alignTick": "boolean，控制坐标轴刻度线是否对齐刻度",
    "length": "number: 0-50，设置坐标轴刻度线长度",
    "style": {
      "stroke": "color，设置坐标轴刻度线颜色",
      "lineWidth": "number: 0-10，设置坐标轴刻度线宽度",
      "lineDash": "array，设置坐标轴刻度线虚线，例如 [4, 4]",
      "opacity": "number: 0-1，设置坐标轴刻度线透明度"
    }
  },
  "subTickLine": {
    "count": "number: 0-20，设置坐标轴子刻度数量",
    "length": "number: 0-50，设置坐标轴子刻度线长度",
    "style": {
      "stroke": "color，设置坐标轴子刻度线颜色",
      "lineWidth": "number: 0-10，设置坐标轴子刻度线宽度",
      "lineDash": "array，设置坐标轴子刻度线虚线，例如 [2, 2]",
      "opacity": "number: 0-1，设置坐标轴子刻度线透明度"
    }
  },
  "title": {
    "text": "string，设置坐标轴标题文本",
    "offset": "number: -100-100，设置坐标轴标题距离轴线偏移",
    "spacing": "number: 0-100，设置坐标轴标题距离轴标签间距",
    "autoRotate": "boolean，控制坐标轴标题是否自动旋转",
    "rotation": "number: -6.2832-6.2832，设置坐标轴标题旋转弧度",
    "position": "start | center | end，设置轴标题位置",
    "style": {
      "fill": "color，设置坐标轴标题文字颜色",
      "stroke": "color，设置坐标轴标题描边色",
      "lineWidth": "number: 0-10，设置坐标轴标题描边宽度",
      "fontSize": "number: 8-48，设置坐标轴标题字号",
      "fontWeight": "number: 100-900，设置坐标轴标题字重",
      "opacity": "number: 0-1，设置坐标轴标题透明度",
      "textAlign": "left | center | right | start | end，设置坐标轴标题水平对齐",
      "textBaseline": "top | middle | bottom，设置坐标轴标题基线"
    }
  }
}
<g2plot-axis-extended>

### 坐标轴标题

<g2plot-title>
{
  "text": "string，设置坐标轴标题文本",
  "offset": "number: -100-100，设置坐标轴标题距离轴线偏移",
  "spacing": "number: 0-100，设置坐标轴标题距离轴标签间距",
  "autoRotate": "boolean，控制坐标轴标题是否自动旋转",
  "rotation": "number: -6.2832-6.2832，设置坐标轴标题旋转弧度",
  "position": "start | center | end，设置坐标轴标题位置",
  "style": {
    "fill": "color，设置坐标轴标题文字颜色",
    "fontSize": "number: 8-48，设置坐标轴标题字号",
    "fontWeight": "number: 100-900，设置坐标轴标题字重",
    "opacity": "number: 0-1，设置坐标轴标题透明度",
    "textAlign": "left | center | right | start | end，设置坐标轴标题水平对齐",
    "textBaseline": "top | middle | bottom，设置坐标轴标题基线"
  }
}
<g2plot-title>

## 图例、提示与交互

### 图例

<g2plot-legend>
{
  "position": "left-top | left | left-bottom | top-left | top | top-right | right-top | right | right-bottom | bottom-left | bottom | bottom-right，设置图例停靠位置",
  "layout": "horizontal | vertical，设置图例横向或纵向排列",
  "flipPage": "boolean，控制图例超出时是否分页",
  "maxRow": "number: 1-20，设置横向图例最大行数",
  "itemWidth": "number: 0-500，设置图例项宽度",
  "itemHeight": "number: 0-100，设置图例项高度",
  "maxItemWidth": "number: 0-1000，设置图例项最大宽度",
  "maxWidth": "number: 0-2000，设置图例最大宽度",
  "maxHeight": "number: 0-2000，设置图例最大高度",
  "title": {
    "text": "string，设置图例标题文本",
    "spacing": "number: 0-100，设置图例标题与图例项间距",
    "style": {
      "fill": "color，设置图例标题颜色",
      "fontSize": "number: 8-48，设置图例标题字号",
      "fontWeight": "number: 100-900，设置图例标题字重"
    }
  },
  "itemName": {
    "spacing": "number: 0-100，设置图例名称与附加值间距",
    "style": {
      "fill": "color，设置图例项文字颜色",
      "fontSize": "number: 8-48，设置图例项文字字号",
      "fontWeight": "number: 100-900，设置图例项文字字重",
      "opacity": "number: 0-1，设置图例项文字透明度"
    }
  },
  "itemValue": {
    "alignRight": "boolean，控制图例附加值是否右对齐",
    "style": {
      "fill": "color，设置图例附加值文字颜色",
      "fontSize": "number: 8-48，设置图例附加值字号",
      "fontWeight": "number: 100-900，设置图例附加值字重"
    }
  },
  "itemSpacing": "number: 0-100，设置图例项之间的水平间距",
  "itemMarginBottom": "number: 0-100，设置图例项之间的垂直间距",
  "marker": {
    "symbol": "circle | square | diamond | triangle | triangle-down | hexagon | bowtie | cross | tick | plus | hyphen | line，设置图例标记形状",
    "style": {
      "r": "number: 0-30，设置图例圆形标记半径",
      "fill": "color，设置图例标记填充色",
      "stroke": "color，设置图例标记描边色",
      "lineWidth": "number: 0-10，设置图例标记描边宽度"
    }
  },
  "background": {
    "padding": "number: 0-80，设置图例背景内边距",
    "style": {
      "fill": "color，设置图例背景填充色",
      "stroke": "color，设置图例背景描边色",
      "lineWidth": "number: 0-10，设置图例背景描边宽度"
    }
  }
}
<g2plot-legend>

### 提示框

<g2plot-tooltip>
{
  "fields": "array，设置 tooltip 展示字段列表",
  "shared": "boolean，控制 tooltip 是否共享展示多条数据",
  "showTitle": "boolean，控制 tooltip 是否显示标题",
  "title": "string，设置 tooltip 标题字段或固定标题",
  "position": "top | bottom | left | right，设置 tooltip 固定展示位置",
  "follow": "boolean，控制 tooltip 是否跟随鼠标",
  "enterable": "boolean，控制鼠标是否可进入 tooltip",
  "showMarkers": "boolean，控制 tooltip 是否显示标记点",
  "showContent": "boolean，控制 tooltip 是否显示内容",
  "showCrosshairs": "boolean，控制 tooltip 是否显示辅助线",
  "offset": "number: 0-200，设置 tooltip 偏移距离",
  "reversed": "boolean，控制 tooltip 数据项是否倒序",
  "showNil": "boolean，控制空值数据项是否展示",
  "crosshairs": {
    "type": "x | y | xy，设置辅助线类型",
    "line": {
      "style": {
        "stroke": "color，设置辅助线颜色",
        "lineWidth": "number: 0-10，设置辅助线宽度",
        "lineDash": "array，设置辅助线虚线，例如 [4, 4]"
      }
    }
  }
}
<g2plot-tooltip>

### 滑动选择器

<g2plot-slider>
{
  "start": "number: 0-1，设置缩略轴起始比例",
  "end": "number: 0-1，设置缩略轴结束比例",
  "height": "number: 0-120，设置缩略轴高度",
  "minLimit": "number: 0-1，设置缩略轴允许滑动下限",
  "maxLimit": "number: 0-1，设置缩略轴允许滑动上限",
  "trendCfg": {
    "isArea": "boolean，控制缩略趋势图是否面积填充",
    "smooth": "boolean，控制缩略趋势图是否平滑"
  },
  "handlerStyle": {
    "width": "number: 0-80，设置滑块手柄宽度",
    "height": "number: 0-80，设置滑块手柄高度",
    "fill": "color，设置滑块手柄填充色",
    "highLightFill": "color，设置滑块手柄 hover 填充色",
    "stroke": "color，设置滑块手柄描边色",
    "opacity": "number: 0-1，设置滑块手柄透明度",
    "radius": "number: 0-40，设置滑块手柄圆角",
    "cursor": "string，设置滑块手柄鼠标样式"
  },
  "backgroundStyle": {
    "fill": "color，设置缩略轴背景色",
    "opacity": "number: 0-1，设置缩略轴背景透明度"
  },
  "foregroundStyle": {
    "fill": "color，设置缩略轴前景色",
    "opacity": "number: 0-1，设置缩略轴前景透明度"
  },
  "textStyle": {
    "fill": "color，设置缩略轴文本颜色",
    "fontSize": "number: 8-48，设置缩略轴文本字号"
  }
}
<g2plot-slider>

### 滚动条

<g2plot-scrollbar>
{
  "type": "horizontal | vertical，设置滚动条方向",
  "categorySize": "number: 1-200，设置分类项尺寸"
}
<g2plot-scrollbar>

### 折线与玫瑰图标签

<g2plot-label-line>
{
  "position": "top | middle | bottom | left | right，设置数据标签相对图形的位置",
  "offset": "number: -100-100，设置数据标签整体偏移量",
  "offsetX": "number: -100-100，设置数据标签水平偏移量",
  "offsetY": "number: -100-100，设置数据标签垂直偏移量",
  "autoRotate": "boolean，控制标签是否自动旋转",
  "rotate": "number: -6.2832-6.2832，设置标签旋转弧度",
  "labelLine": {
    "style": {
      "stroke": "color，设置标签引导线颜色",
      "lineWidth": "number: 0-10，设置标签引导线宽度",
      "lineDash": "array，设置标签引导线虚线，例如 [4, 4]",
      "opacity": "number: 0-1，设置标签引导线透明度"
    }
  },
  "style": {
    "fill": "color，设置数据标签文字颜色",
    "stroke": "color，设置数据标签描边色",
    "lineWidth": "number: 0-10，设置数据标签描边宽度",
    "fontSize": "number: 8-48，设置数据标签字号",
    "fontWeight": "number: 100-900，设置数据标签字重",
    "opacity": "number: 0-1，设置数据标签透明度",
    "textAlign": "left | center | right | start | end，设置数据标签水平对齐",
    "textBaseline": "top | middle | bottom，设置数据标签基线"
  }
}
<g2plot-label-line>

### 条形图标签

<g2plot-label-bar>
{
  "position": "left | right | top | bottom | middle，设置数据标签相对条形的位置",
  "offsetX": "number: -100-100，设置数据标签水平偏移量",
  "offsetY": "number: -100-100，设置数据标签垂直偏移量",
  "style": {
    "fill": "color，设置数据标签文字颜色",
    "stroke": "color，设置数据标签描边色",
    "lineWidth": "number: 0-10，设置数据标签描边宽度",
    "fontSize": "number: 8-48，设置数据标签字号",
    "fontWeight": "number: 100-900，设置数据标签字重",
    "opacity": "number: 0-1，设置数据标签透明度"
  }
}
<g2plot-label-bar>

### 柱状图标签

<g2plot-label-column>
{
  "position": "left | right | top | bottom | middle，设置数据标签相对柱形的位置",
  "offsetX": "number: -100-100，设置数据标签水平偏移量",
  "offsetY": "number: -100-100，设置数据标签垂直偏移量",
  "style": {
    "fill": "color，设置数据标签文字颜色",
    "stroke": "color，设置数据标签描边色",
    "lineWidth": "number: 0-10，设置数据标签描边宽度",
    "fontSize": "number: 8-48，设置数据标签字号",
    "fontWeight": "number: 100-900，设置数据标签字重",
    "opacity": "number: 0-1，设置数据标签透明度"
  }
}
<g2plot-label-column>

### 面积图标签

<g2plot-label-area>
{
  "position": "top | middle | bottom | left | right，设置数据标签相对数据点的位置",
  "offsetX": "number: -100-100，设置数据标签水平偏移量",
  "offsetY": "number: -100-100，设置数据标签垂直偏移量",
  "style": {
    "fill": "color，设置数据标签文字颜色",
    "stroke": "color，设置数据标签描边色",
    "lineWidth": "number: 0-10，设置数据标签描边宽度",
    "fontSize": "number: 8-48，设置数据标签字号",
    "fontWeight": "number: 100-900，设置数据标签字重",
    "opacity": "number: 0-1，设置数据标签透明度"
  }
}
<g2plot-label-area>

## 绘图区域与图形样式

### 面积图绘制参数

<g2plot-area-plot>
{
  "color": "color | color[]，设置面积图主色或系列配色，每个颜色必须为 hex 或 stop color 全部为 hex 的 G2 渐变字符串",
  "coordinate": "array，设置坐标转换，例如 [{\"type\":\"transpose\"}]",
  "startOnZero": "boolean，控制面积图填充区域是否从 0 基线开始"
}
<g2plot-area-plot>

### 面积区域样式

<g2plot-area-style>
{
  "fill": "color，设置面积区域填充颜色，必须为 hex 或 stop color 全部为 hex 的 G2 渐变字符串，禁止 transparent",
  "fillOpacity": "number: 0-1，设置面积区域填充透明度",
  "stroke": "color，设置面积区域描边色",
  "lineWidth": "number: 0-10，设置面积区域描边宽度",
  "lineDash": "array，设置面积区域描边虚线，例如 [4, 4]",
  "lineOpacity": "number: 0-1，设置面积区域描边透明度",
  "strokeOpacity": "number: 0-1，设置面积区域边框透明度",
  "opacity": "number: 0-1，设置面积区域整体透明度",
  "shadowColor": "color，设置面积区域阴影颜色",
  "shadowBlur": "number: 0-100，设置面积区域阴影模糊",
  "shadowOffsetX": "number: -100-100，设置面积区域阴影水平偏移",
  "shadowOffsetY": "number: -100-100，设置面积区域阴影垂直偏移",
  "cursor": "string，设置鼠标样式"
}
<g2plot-area-style>

### 图形贴图

<g2plot-pattern>
{
  "type": "dot | line | square，设置图形贴图类型",
  "cfg": {
    "backgroundColor": "color，设置贴图背景色",
    "fill": "color，设置贴图元素填充色",
    "fillOpacity": "number: 0-1，设置贴图元素填充透明度",
    "stroke": "color，设置贴图元素描边色",
    "strokeOpacity": "number: 0-1，设置贴图元素描边透明度",
    "lineWidth": "number: 0-20，设置贴图元素描边宽度",
    "opacity": "number: 0-1，设置贴图整体透明度",
    "rotation": "number: -6.2832-6.2832，设置贴图旋转弧度",
    "size": "number: 0-100，设置 dot/square 贴图元素大小",
    "padding": "number: 0-100，设置 dot/square 贴图元素间距",
    "spacing": "number: 0-100，设置 line 贴图线间距",
    "isStagger": "boolean，控制 dot/square 贴图是否交错"
  }
}
<g2plot-pattern>

### 折线图绘制参数

<g2plot-line-plot>
{
  "color": "color | color[]，设置折线颜色，必须为 hex 或 stop color 全部为 hex 的 G2 渐变字符串",
  "connectNulls": "boolean，控制是否连接空值点"
}
<g2plot-line-plot>

### 折线样式

<g2plot-line-style>
{
  "stroke": "color，设置折线描边色",
  "lineWidth": "number: 0-10，设置折线宽度",
  "lineDash": "array，设置折线虚线，例如 [4, 4]",
  "lineJoin": "miter | round | bevel，设置折线连接方式",
  "lineCap": "butt | round | square，设置折线端点样式",
  "opacity": "number: 0-1，设置折线透明度"
}
<g2plot-line-style>

### 面积图数据线

<g2plot-area-line>
{
  "color": "color，设置数据线颜色，必须为 hex 或 stop color 全部为 hex 的 G2 渐变字符串",
  "size": "number: 0-10，设置数据线宽度",
  "style": {
    "stroke": "color，设置数据线描边色",
    "lineWidth": "number: 0-10，设置数据线描边宽度",
    "lineDash": "array，设置数据线虚线，例如 [4, 4]",
    "lineJoin": "miter | round | bevel，设置数据线连接方式",
    "lineCap": "butt | round | square，设置数据线端点样式",
    "opacity": "number: 0-1，设置数据线透明度"
  }
}
<g2plot-area-line>

### 折线图数据点

<g2plot-line-point>
{
  "size": "number: 0-20，设置数据点大小",
  "shape": "circle | square | bowtie | diamond | hexagon | triangle，设置数据点形状",
  "color": "color | color[]，设置数据点颜色",
  "style": {
    "fill": "color，设置数据点填充色",
    "stroke": "color，设置数据点描边色",
    "lineWidth": "number: 0-10，设置数据点描边宽度",
    "fillOpacity": "number: 0-1，设置数据点填充透明度",
    "opacity": "number: 0-1，设置数据点透明度"
  }
}
<g2plot-line-point>

### 面积图数据点

<g2plot-area-point>
{
  "size": "number: 0-20，设置数据点大小",
  "shape": "circle | square | bowtie | diamond | hexagon | triangle，设置数据点形状",
  "style": {
    "fill": "color，设置数据点填充色",
    "stroke": "color，设置数据点描边色",
    "lineWidth": "number: 0-10，设置数据点描边宽度",
    "opacity": "number: 0-1，设置数据点透明度"
  }
}
<g2plot-area-point>

### 散点样式

<g2plot-point-style>
{
  "fill": "color，设置散点填充色",
  "fillOpacity": "number: 0-1，设置散点填充透明度",
  "stroke": "color，设置散点描边色",
  "lineWidth": "number: 0-10，设置散点描边宽度",
  "lineDash": "array，设置散点描边虚线，例如 [4, 4]",
  "lineOpacity": "number: 0-1，设置散点描边透明度",
  "strokeOpacity": "number: 0-1，设置散点边框透明度",
  "opacity": "number: 0-1，设置散点整体透明度",
  "shadowColor": "color，设置散点阴影颜色",
  "shadowBlur": "number: 0-100，设置散点阴影模糊",
  "shadowOffsetX": "number: -100-100，设置散点阴影水平偏移",
  "shadowOffsetY": "number: -100-100，设置散点阴影垂直偏移",
  "cursor": "string，设置鼠标样式"
}
<g2plot-point-style>

### 条形图布局

<g2plot-bar-layout>
{
  "barWidthRatio": "number: 0-1，设置条形宽度占可用带宽的比例",
  "dodgePadding": "number: 0-100，设置分组条形间距，仅在 G2Plot 需要分组布局时生效",
  "intervalPadding": "number: 0-100，设置相邻条形间距",
  "maxBarWidth": "number: 0-300，设置条形最大宽度",
  "minBarWidth": "number: 0-200，设置条形最小宽度",
  "shape": "rect | hollow-rect，设置条形形状"
}
<g2plot-bar-layout>

### 条形样式

<g2plot-bar-style>
{
  "fill": "color，设置条形填充色，必须为 hex 或 stop color 全部为 hex 的 G2 渐变字符串",
  "fillOpacity": "number: 0-1，设置条形填充透明度",
  "stroke": "color，设置条形描边色",
  "lineWidth": "number: 0-10，设置条形描边宽度",
  "lineDash": "array，设置条形描边虚线，例如 [4, 4]",
  "lineOpacity": "number: 0-1，设置条形描边透明度",
  "strokeOpacity": "number: 0-1，设置条形边框透明度",
  "opacity": "number: 0-1，设置条形整体透明度",
  "radius": "number | array，设置条形圆角，例如 6 或 [6, 6, 0, 0]",
  "shadowColor": "color，设置条形阴影颜色",
  "shadowBlur": "number: 0-100，设置条形阴影模糊",
  "shadowOffsetX": "number: -100-100，设置条形阴影水平偏移",
  "shadowOffsetY": "number: -100-100，设置条形阴影垂直偏移",
  "cursor": "string，设置鼠标样式"
}
<g2plot-bar-style>

### 条形背景

<g2plot-bar-background>
{
  "style": {
    "fill": "color，设置条形背景填充色",
    "fillOpacity": "number: 0-1，设置条形背景填充透明度",
    "stroke": "color，设置条形背景描边色",
    "lineWidth": "number: 0-10，设置条形背景描边宽度",
    "radius": "number | array，设置条形背景圆角，例如 6 或 [6, 6, 0, 0]",
    "opacity": "number: 0-1，设置条形背景整体透明度"
  }
}
<g2plot-bar-background>

### 柱形图宽度

<g2plot-column-layout>
{
  "columnWidthRatio": "number: 0-1，设置柱形宽度占可用带宽的比例",
  "maxColumnWidth": "number: 0-300，设置柱形最大宽度",
  "minColumnWidth": "number: 0-200，设置柱形最小宽度"
}
<g2plot-column-layout>

### 柱形图系列与间距

<g2plot-column-series>
{
  "color": "color | color[]，设置柱状图主色或系列配色，每个颜色必须为 hex 或 stop color 全部为 hex 的 G2 渐变字符串",
  "dodgePadding": "number: 0-100，设置分组柱形间距，仅在 G2Plot 需要分组布局时生效",
  "intervalPadding": "number: 0-100，设置相邻柱形间距",
  "shape": "rect | hollow-rect，设置柱形形状"
}
<g2plot-column-series>

### 柱形样式

<g2plot-column-style>
{
  "fill": "color，设置柱形填充色，必须为 hex 或 stop color 全部为 hex 的 G2 渐变字符串",
  "fillOpacity": "number: 0-1，设置柱形填充透明度",
  "stroke": "color，设置柱形描边色",
  "lineWidth": "number: 0-10，设置柱形描边宽度",
  "lineDash": "array，设置柱形描边虚线，例如 [4, 4]",
  "lineOpacity": "number: 0-1，设置柱形描边透明度",
  "strokeOpacity": "number: 0-1，设置柱形边框透明度",
  "opacity": "number: 0-1，设置柱形整体透明度",
  "radius": "number | array，设置柱形圆角，例如 6 或 [6, 6, 0, 0]",
  "shadowColor": "color，设置柱形阴影颜色",
  "shadowBlur": "number: 0-100，设置柱形阴影模糊",
  "shadowOffsetX": "number: -100-100，设置柱形阴影水平偏移",
  "shadowOffsetY": "number: -100-100，设置柱形阴影垂直偏移",
  "cursor": "string，设置鼠标样式"
}
<g2plot-column-style>

### 柱形背景

<g2plot-column-background>
{
  "style": {
    "fill": "color，设置柱形背景填充色",
    "fillOpacity": "number: 0-1，设置柱形背景填充透明度",
    "stroke": "color，设置柱形背景描边色",
    "lineWidth": "number: 0-10，设置柱形背景描边宽度",
    "radius": "number | array，设置柱形背景圆角，例如 6 或 [6, 6, 0, 0]",
    "opacity": "number: 0-1，设置柱形背景整体透明度"
  }
}
<g2plot-column-background>

### 玫瑰图绘制参数

<g2plot-rose-plot>
{
  "color": "color | color[]，设置扇区颜色",
  "innerRadius": "number: 0-1，设置玫瑰图内半径",
  "radius": "number: 0-1，设置玫瑰图外半径"
}
<g2plot-rose-plot>

### 扇区样式

<g2plot-sector-style>
{
  "fill": "color，设置玫瑰扇区填充色",
  "fillOpacity": "number: 0-1，设置玫瑰扇区填充透明度",
  "stroke": "color，设置玫瑰扇区描边色",
  "lineWidth": "number: 0-10，设置玫瑰扇区描边宽度",
  "lineDash": "array，设置玫瑰扇区描边虚线，例如 [4, 4]",
  "lineOpacity": "number: 0-1，设置玫瑰扇区描边透明度",
  "strokeOpacity": "number: 0-1，设置玫瑰扇区边框透明度",
  "opacity": "number: 0-1，设置玫瑰扇区整体透明度",
  "shadowColor": "color，设置玫瑰扇区阴影颜色",
  "shadowBlur": "number: 0-100，设置玫瑰扇区阴影模糊",
  "shadowOffsetX": "number: -100-100，设置玫瑰扇区阴影水平偏移",
  "shadowOffsetY": "number: -100-100，设置玫瑰扇区阴影垂直偏移",
  "cursor": "string，设置鼠标样式"
}
<g2plot-sector-style>

### 极坐标角度

<g2plot-polar-angles>
{
  "startAngle": "number: -6.2832-6.2832，设置开始角度",
  "endAngle": "number: -6.2832-6.2832，设置结束角度"
}
<g2plot-polar-angles>

### 散点与气泡参数

<g2plot-scatter-plot>
{
  "color": "color | color[]，设置散点或气泡颜色，必须为 hex 或 stop color 全部为 hex 的 G2 渐变字符串",
  "shape": "circle | square | bowtie | diamond | hexagon | triangle，设置点形状",
  "size": "number | [number, number]，设置点大小或大小范围，仅改变视觉半径，不改变数据值"
}
<g2plot-scatter-plot>

### 象限配置

<g2plot-quadrant>
{
  "xBaseline": "number，设置 x 方向象限分割基准线",
  "yBaseline": "number，设置 y 方向象限分割基准线",
  "lineStyle": {
    "stroke": "color，设置象限分割线颜色",
    "lineWidth": "number: 0-10，设置象限分割线宽度",
    "lineDash": "array，设置象限分割线虚线"
  },
  "regionStyle": [
    {
      "fill": "color，设置单个象限区域填充色",
      "fillOpacity": "number: 0-1，设置单个象限区域填充透明度",
      "stroke": "color，设置单个象限区域描边色",
      "lineWidth": "number: 0-10，设置单个象限区域描边宽度",
      "opacity": "number: 0-1，设置单个象限区域整体透明度"
    }
  ],
  "labels": [
    {
      "content": "string | number，设置单个象限文本内容",
      "position": "array，设置单个象限文本位置，例如 ['max', 0]",
      "offsetX": "number: -100-100，设置单个象限文本水平偏移",
      "offsetY": "number: -100-100，设置单个象限文本垂直偏移",
      "rotate": "number: -6.2832-6.2832，设置单个象限文本旋转弧度",
      "style": {
        "fill": "color，设置单个象限文本颜色",
        "fontSize": "number: 8-48，设置单个象限文本字号",
        "fontWeight": "number: 100-900，设置单个象限文本字重",
        "opacity": "number: 0-1，设置单个象限文本透明度",
        "textAlign": "left | center | right | start | end，设置单个象限文本水平对齐",
        "textBaseline": "top | middle | bottom，设置单个象限文本基线"
      }
    }
  ]
}
<g2plot-quadrant>

### 回归线

<g2plot-regression-line>
{
  "top": "boolean，控制回归线是否顶层显示",
  "type": "linear | exp | loess | log | poly | pow | quad，设置回归线类型",
  "style": {
    "stroke": "color，设置回归线颜色",
    "lineWidth": "number: 0-10，设置回归线宽度",
    "lineDash": "array，设置回归线虚线",
    "opacity": "number: 0-1，设置回归线透明度"
  },
  "showEquation": "boolean，控制是否显示回归方程式",
  "equation": "string，自定义回归方程式文本，仅在非算法回调场景使用",
  "equationStyle": {
    "fill": "color，设置回归方程式文字颜色",
    "stroke": "color，设置回归方程式描边色",
    "lineWidth": "number: 0-10，设置回归方程式描边宽度",
    "fontSize": "number: 8-48，设置回归方程式字号",
    "fontWeight": "number: 100-900，设置回归方程式字重",
    "opacity": "number: 0-1，设置回归方程式透明度",
    "textAlign": "left | center | right | start | end，设置回归方程式水平对齐",
    "textBaseline": "top | middle | bottom，设置回归方程式基线"
  }
}
<g2plot-regression-line>

### 统计文本

<g2plot-statistic>
{
  "title": {
    "content": "string，设置标题文本",
    "offsetX": "number: -100-100，设置标题水平偏移",
    "offsetY": "number: -100-100，设置标题垂直偏移",
    "style": {
      "color": "color，设置标题颜色",
      "fill": "color，设置标题填充色",
      "fontSize": "number | string，设置标题字号",
      "fontWeight": "number: 100-900，设置标题字重"
    }
  },
  "content": {
    "content": "string，设置内容文本",
    "offsetX": "number: -100-100，设置内容水平偏移",
    "offsetY": "number: -100-100，设置内容垂直偏移",
    "style": {
      "color": "color，设置内容颜色",
      "fill": "color，设置内容填充色",
      "fontSize": "number | string，设置内容字号",
      "fontWeight": "number: 100-900，设置内容字重"
    }
  }
}
<g2plot-statistic>
