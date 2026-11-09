/* Licensed under the DataVisool License. See the LICENSE file distributed with this software. */
// @deprecated TODO(legacy-compat): Remove this converter when legacy component interfaces are no longer supported.
function convertLegacyComponent(source, styleMappings, convertCssText) {
    var oldNames = ['LightChaserInterface', 'LightChaserUtil', 'LightChaserUI', 'LCPUI', 'LCPSDK', 'LCPTypes'];
    var oldMarker = '__LIGHT_CHASER_REMOTE_COMPONENT_TEMP__';
    var allowed = [
        ['AbstractController','AbstractDefinition','AbstractDesignerController','AbstractDesignerDefinition','BaseInfo','AnimationConfig','ThemeConfig','DataConfig','FilterConfig','BPExecutor'],
        ['ComponentUtil','ObjectUtil','Base64Util','ColorUtil','FileUtil','IdGenerate','URLUtil'],
        ['LCGUI'],
        ['Accordion', 'Avatar', 'Button', 'Card', 'CardPanel', 'CheckBox', 'CodeEditor', 'normalizeEditorValue',
         'ColorMode', 'ColorPicker', 'ColorsPicker', 'ControlGroup', 'FrameLayout', 'Dialog', 'Dropdown', 'Empty',
         'FullEditor', 'GlobalMessage', 'GlobalModal', 'Grid', 'GroupButton', 'ImageUpload', 'Input',
         'LCGUI', 'LCGUIUtil', 'LCGUIUtilDefault', 'Loading', 'Menu', 'MonacoEditor', 'NumberInput',
         'Pagination', 'Progress', 'Radio', 'RangeSlider', 'SchemaPathNode', 'SearchableSelect', 'Select',
         'Slider', 'Space', 'Spin', 'SubAccordion', 'Switch', 'Tabs', 'Tag', 'TextArea', 'TextOnly',
         'UIContainer', 'UIMap', 'Upload', 'globalMessage', 'globalModal', 'buttonVariants', 'cn',
         'LCPUIContext', 'LCPUIProvider', 'useLCPUI'],
        ['AbstractController','AbstractDefinition','AbstractDesignerController','AbstractDesignerDefinition','AnimationConfig','BPExecutor',
         'Base64Util','BaseInfo','ColorUtil','ComponentUtil','DataConfig','FileUtil','FilterConfig','IdGenerate','ObjectUtil','ThemeConfig',
         'URLUtil','registerHostConfigPanels','setRenderErrorFallback'],
        ['AnchorPointType','DesignerMode','DesignerScene','ProjectState']
    ];
    var renamedUiMembers = {
        LCGUI: 'DatavisoolGUI',
        LCGUIUtil: 'DatavisoolGUIUtil',
        LCGUIUtilDefault: 'DatavisoolGUIUtilDefault',
        LCPUIContext: 'DataVisoolUIContext',
        LCPUIProvider: 'DataVisoolUIProvider',
        useLCPUI: 'useDataVisoolUI'
    };
    var utilityMethods = {
        ComponentUtil: ['createAndRender', 'unmount'],
        ObjectUtil: ['merge', 'getOriginValue', 'removeEmptyKeys', 'objToCodeStr'],
        Base64Util: ['toBase64', 'fromBase64'],
        ColorUtil: ['colorConversion', 'hexToRgba', 'rgbaToHex', 'parseLinerGradient', 'parseRadialGradient'],
        FileUtil: ['blobToBase64', 'base64ToBlob'],
        IdGenerate: ['generateId'],
        URLUtil: ['parseUrlParams']
    };
    var tree = acorn.parse(source, {ecmaVersion: 2022, sourceType: 'script'});
    function maskCssComments(value, removeComments) {
        var masked = '';
        var quote = '';
        for (var i = 0; i < value.length;) {
            var current = value[i];
            if (quote) {
                masked += current;
                i++;
                if (current === '\\' && i < value.length) masked += value[i++];
                else if (current === quote) quote = '';
            } else if (current === '"' || current === "'") {
                quote = current;
                masked += current;
                i++;
            } else if (current === '\\' && i + 1 < value.length) {
                masked += value.slice(i, i + 2);
                i += 2;
            } else if (current === '/' && value[i + 1] === '*') {
                var end = value.indexOf('*/', i + 2);
                if (end < 0) return value;
                if (!removeComments) {
                    for (var j = i; j < end + 2; j++) masked += /[\t\n\r\f ]/.test(value[j]) ? value[j] : ' ';
                }
                i = end + 2;
            } else {
                masked += current;
                i++;
            }
        }
        return masked;
    }
    function isStyleReference(value) {
        function decodeCssSearch(text) {
            return text.replace(/\\([0-9a-fA-F]{1,6})(?:[\t\n\r\f ]|)|\\([^\r\n\f])/g, function(_, hex, escaped) {
                if (hex) {
                    var code = parseInt(hex, 16);
                    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : '\ufffd';
                }
                return escaped;
            });
        }
        var decoded = decodeCssSearch(maskCssComments(value));
        var joinedComments = decodeCssSearch(maskCssComments(value, true));
        var oldStyle = /(?:\.lcp-[a-zA-Z0-9_-]+|--lcp-[a-zA-Z0-9_-]+|\.lc-dialog(?:[a-zA-Z0-9_-]*)|\.cm-s-lcp-[a-zA-Z0-9_-]+)/;
        var oldClassAttribute = /\[\s*class\s*(?:~=|=|\*=|\^=|\$=|\|=)[^\]]*(?:lcp-|lc-dialog)/i;
        return oldStyle.test(decoded) || oldClassAttribute.test(decoded) ||
            oldStyle.test(joinedComments) || oldClassAttribute.test(joinedComments);
    }
    function isResource(value) {
        var lower = value.toLowerCase();
        return /^(?:\/|\.\.?\/|https?:|data:)/.test(lower) ||
            /\.(?:js|mjs|css|svg|png|jpe?g|gif|webp|woff2?|ttf)(?:[?#].*)?$/.test(lower);
    }
    var parents = new WeakMap();
    function collectParents(node, parent) {
        if (!node || typeof node !== 'object') return;
        if (parent) parents.set(node, parent);
        for (var key in node) {
            if (key === 'start' || key === 'end' || key === 'loc' || key === 'range' || key === 'raw' || key === 'type') continue;
            var child = node[key];
            if (Array.isArray(child)) for (var i = 0; i < child.length; i++) collectParents(child[i], node);
            else if (child && typeof child === 'object') collectParents(child, node);
        }
    }
    collectParents(tree, null);
    function bindingPatternHasName(pattern, name) {
        if (!pattern || typeof pattern !== 'object') return false;
        if (pattern.type === 'Identifier') return pattern.name === name;
        if (pattern.type === 'RestElement') return bindingPatternHasName(pattern.argument, name);
        if (pattern.type === 'AssignmentPattern') return bindingPatternHasName(pattern.left, name);
        if (pattern.type === 'ArrayPattern') return pattern.elements.some(function(element) { return bindingPatternHasName(element, name); });
        if (pattern.type === 'ObjectPattern') return pattern.properties.some(function(property) {
            return property.type === 'RestElement' ? bindingPatternHasName(property.argument, name) : bindingPatternHasName(property.value, name);
        });
        return false;
    }
    var styleElementBindingIndex = null;
    function unwrapExpression(node) {
        while (node && node.type === 'ParenthesizedExpression') node = node.expression;
        return node;
    }
    function isReactCreateElement(call) {
        var callee = call.callee;
        if (!callee || callee.type !== 'MemberExpression' || callee.computed || callee.property.type !== 'Identifier' || callee.property.name !== 'createElement') return false;
        if (callee.object.type === 'Identifier' && callee.object.name === 'React') return true;
        if (callee.object.type !== 'Identifier') return false;
        var alias = callee.object.name;
        for (var current = parents.get(call); current; current = parents.get(current)) {
            if (current.type !== 'FunctionExpression' && current.type !== 'ArrowFunctionExpression') continue;
            var parameterIndex = current.params.findIndex(function(parameter) { return parameter.type === 'Identifier' && parameter.name === alias; });
            if (parameterIndex < 0) continue;
            for (var outer = parents.get(current); outer; outer = parents.get(outer)) {
                if (outer.type !== 'CallExpression' || unwrapExpression(outer.callee) !== current) continue;
                var argument = outer.arguments[parameterIndex];
                if (argument && argument.type === 'Identifier' && argument.name === 'React') return true;
            }
        }
        return false;
    }
    function patternNames(pattern, output) {
        if (!pattern || typeof pattern !== 'object') return;
        if (pattern.type === 'Identifier') { output.push(pattern.name); return; }
        if (pattern.type === 'RestElement') patternNames(pattern.argument, output);
        else if (pattern.type === 'AssignmentPattern') patternNames(pattern.left, output);
        else if (pattern.type === 'ArrayPattern') pattern.elements.forEach(function(element) { patternNames(element, output); });
        else if (pattern.type === 'ObjectPattern') pattern.properties.forEach(function(property) {
            patternNames(property.type === 'RestElement' ? property.argument : property.value, output);
        });
    }
    function makeStyleElementBindingIndex() {
        var bindings = Object.create(null);
        var declarations = Object.create(null);
        var identifiers = Object.create(null);
        var documentIdentifiers = [];
        var globalObjectAccessUnsafe = false;
        var domPrototypeNames = ['Document', 'HTMLDocument', 'Node', 'Element', 'HTMLElement', 'HTMLHeadElement', 'DocumentFragment', 'ShadowRoot'];
        function isDomConstructorName(name) { return domPrototypeNames.includes(name) || /^HTML[A-Za-z0-9]*Element$/.test(name); }
        function isGlobalRootName(name) { return ['window', 'globalThis', 'self', 'parent', 'top', 'Object', 'Reflect'].includes(name) || isDomConstructorName(name); }
        var globalPathCache = new WeakMap();
        var bindingIdentifiers = new WeakSet();
        function add(map, name, value) { (map[name] || (map[name] = [])).push(value); }
        function isUnsafeGlobalProperty(rootName, propertyName) {
            if (['document', 'parent', 'top', 'frames', 'self', 'window', 'globalThis'].includes(propertyName)) return true;
            if (isDomConstructorName(rootName) && propertyName === 'prototype') return true;
            if ((rootName === 'Object' || rootName === 'Reflect') && ['getPrototypeOf', 'setPrototypeOf'].includes(propertyName)) return true;
            return ['window', 'globalThis', 'self', 'parent', 'top'].includes(rootName) &&
                (isDomConstructorName(propertyName) || ['Object', 'Reflect'].includes(propertyName));
        }
        function isInstanceOfTypeExpression(node) {
            var parent = parents.get(node);
            return parent && parent.type === 'BinaryExpression' && parent.operator === 'instanceof' && parent.right === node;
        }
        function isHarmlessTypeof(node) {
            var parent = parents.get(node);
            return parent && parent.type === 'UnaryExpression' && parent.operator === 'typeof' && parent.argument === node;
        }
        function markBindingPattern(pattern) {
            if (!pattern || typeof pattern !== 'object') return;
            if (pattern.type === 'Identifier') { bindingIdentifiers.add(pattern); return; }
            if (pattern.type === 'RestElement') markBindingPattern(pattern.argument);
            else if (pattern.type === 'AssignmentPattern') markBindingPattern(pattern.left);
            else if (pattern.type === 'ArrayPattern') pattern.elements.forEach(markBindingPattern);
            else if (pattern.type === 'ObjectPattern') pattern.properties.forEach(function(property) {
                markBindingPattern(property.type === 'RestElement' ? property.argument : property.value);
            });
        }
        function globalPathInfo(node) {
            if (!node || typeof node !== 'object') return {root: false, unsafe: false};
            if (globalPathCache.has(node)) return globalPathCache.get(node);
            var chain = [];
            var current = node;
            while (current && current.type === 'MemberExpression' && !globalPathCache.has(current)) {
                chain.push(current);
                current = current.object;
            }
            var info = current && current.type === 'Identifier' && isGlobalRootName(current.name)
                ? {root: true, unsafe: false, rootName: current.name}
                : current && current.type === 'ThisExpression' ? {root: true, unsafe: false, rootName: 'this'}
                : globalPathCache.get(current) || {root: false, unsafe: false, rootName: null};
            for (var i = chain.length - 1; i >= 0; i--) {
                var part = chain[i];
                var unsafeProperty = part.computed || (part.property.type === 'Identifier' && isUnsafeGlobalProperty(info.rootName, part.property.name));
                info = {root: info.root, unsafe: info.unsafe || unsafeProperty, rootName: info.rootName};
                globalPathCache.set(part, info);
            }
            return globalPathCache.get(node) || info;
        }
        function visit(node) {
            if (!node || typeof node !== 'object') return;
            if (node.type === 'Identifier') {
                add(identifiers, node.name, node);
                if (!bindingIdentifiers.has(node) && isGlobalRootName(node.name)) {
                    var use = parents.get(node);
                    var isPropertyToken = use && use.type === 'MemberExpression' && use.property === node && !use.computed;
                    if (isPropertyToken) return;
                    if (isHarmlessTypeof(node)) return;
                    if (isInstanceOfTypeExpression(node)) return;
                    var safeStaticMember = use && use.type === 'MemberExpression' && use.object === node && !use.computed &&
                        use.property.type === 'Identifier' && !isUnsafeGlobalProperty(node.name, use.property.name);
                    if (!safeStaticMember) globalObjectAccessUnsafe = true;
                }
            }
            if (node.type === 'ThisExpression') {
                var thisUse = parents.get(node);
                if (!thisUse || thisUse.type !== 'MemberExpression' || thisUse.object !== node || thisUse.computed ||
                    thisUse.property.type !== 'Identifier' || isUnsafeGlobalProperty('this', thisUse.property.name))
                    globalObjectAccessUnsafe = true;
            }
            if (node.type === 'MemberExpression') {
                if (!node.computed && node.property.type === 'Identifier' && node.property.name === '__proto__') globalObjectAccessUnsafe = true;
                if (!node.computed && node.property.type === 'Identifier' && node.property.name === 'constructor') globalObjectAccessUnsafe = true;
                if (node.computed && node.property && node.property.type === 'Literal' && ['__proto__', 'constructor'].includes(node.property.value)) globalObjectAccessUnsafe = true;
                var instanceType = parents.get(node);
                if (instanceType && instanceType.type === 'BinaryExpression' && instanceType.operator === 'instanceof' && instanceType.right === node &&
                    !node.computed && node.property.type === 'Identifier' && isDomConstructorName(node.property.name)) return;
                var info = globalPathInfo(node);
                if (info.root && info.unsafe) globalObjectAccessUnsafe = true;
            }
            if (node.type === 'VariableDeclarator') {
                var variableNames = [];
                patternNames(node.id, variableNames);
                markBindingPattern(node.id);
                variableNames.forEach(function(name) { add(bindings, name, node); });
                if (node.id && node.id.type === 'Identifier') add(declarations, node.id.name, node);
            } else if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression') {
                var functionNames = [];
                patternNames(node.id, functionNames);
                markBindingPattern(node.id);
                node.params.forEach(markBindingPattern);
                node.params.forEach(function(parameter) { patternNames(parameter, functionNames); });
                functionNames.forEach(function(name) { add(bindings, name, node); });
            } else if (node.type === 'ArrowFunctionExpression') {
                var arrowNames = [];
                node.params.forEach(markBindingPattern);
                node.params.forEach(function(parameter) { patternNames(parameter, arrowNames); });
                arrowNames.forEach(function(name) { add(bindings, name, node); });
            } else if (node.type === 'ClassDeclaration' || node.type === 'ClassExpression') {
                var classNames = [];
                patternNames(node.id, classNames);
                markBindingPattern(node.id);
                classNames.forEach(function(name) { add(bindings, name, node); });
            } else if (node.type === 'CatchClause') {
                var catchNames = [];
                patternNames(node.param, catchNames);
                markBindingPattern(node.param);
                catchNames.forEach(function(name) { add(bindings, name, node); });
            }
            for (var key in node) {
                if (key === 'start' || key === 'end' || key === 'loc' || key === 'range' || key === 'raw' || key === 'type') continue;
                var child = node[key];
                if (Array.isArray(child)) child.forEach(visit);
                else if (child && typeof child === 'object') visit(child);
            }
        }
        visit(tree);
        documentIdentifiers = identifiers.document || [];
        var documentUsesValid = !(bindings.document && bindings.document.length) && !globalObjectAccessUnsafe;
        function styleDeclaration(alias) {
            var found = declarations[alias] || [];
            if (found.length !== 1 || !bindings[alias] || bindings[alias].length !== 1) return null;
            var declaration = found[0];
            var variableDeclaration = parents.get(declaration);
            var init = declaration.init;
            if (!variableDeclaration || variableDeclaration.type !== 'VariableDeclaration' || variableDeclaration.kind !== 'const' ||
                !init || init.type !== 'CallExpression' || init.arguments.length !== 1 ||
                !init.callee || init.callee.type !== 'MemberExpression' || init.callee.computed ||
                init.callee.object.type !== 'Identifier' || init.callee.object.name !== 'document' ||
                init.callee.property.type !== 'Identifier' || init.callee.property.name !== 'createElement' ||
                init.arguments[0].type !== 'Literal' || init.arguments[0].value !== 'style') return null;
            return declaration;
        }
        var styleDeclarations = Object.create(null);
        Object.keys(declarations).forEach(function(alias) {
            styleDeclarations[alias] = styleDeclaration(alias);
        });
        function isStaticStyleAppend(call, appendMember, expectedArgument) {
            var args = call && call.arguments;
            if (!args || !Array.isArray(args) || !args.length) return false;
            if (appendMember.property.name === 'appendChild' && args.length !== 1) return false;
            if (expectedArgument && args.indexOf(expectedArgument) < 0) return false;
            return args.every(function(argument) {
                return argument.type === 'Identifier' && !!styleDeclarations[argument.name];
            });
        }
        function isDocumentUse(node) {
            var member = parents.get(node);
            if (!member || member.type !== 'MemberExpression' || member.object !== node || member.computed || member.property.type !== 'Identifier') return false;
            if (member.property.name === 'head') {
                var appendMember = parents.get(member);
                var appendCall = appendMember && parents.get(appendMember);
                return !!(appendMember && appendMember.type === 'MemberExpression' && appendMember.object === member && !appendMember.computed &&
                    appendMember.property.type === 'Identifier' && ['appendChild', 'append'].includes(appendMember.property.name) &&
                    appendCall && appendCall.type === 'CallExpression' && appendCall.callee === appendMember &&
                    isStaticStyleAppend(appendCall, appendMember));
            }
            var directCall = parents.get(member);
            if (!['createElement', 'querySelector', 'querySelectorAll', 'getElementById', 'getElementsByClassName', 'getElementsByTagName'].includes(member.property.name) ||
                !directCall || directCall.type !== 'CallExpression' || directCall.callee !== member) return false;
            if (member.property.name === 'createElement' &&
                (directCall.arguments.length !== 1 || directCall.arguments[0].type !== 'Literal' || typeof directCall.arguments[0].value !== 'string')) return false;
            for (var current = parents.get(directCall); current; current = parents.get(current)) {
                if (current.type === 'MemberExpression' && current.property && current.property.type === 'Identifier' &&
                    (/Document$/i.test(current.property.name) || ['head', 'createElement', 'appendChild', 'append', '__proto__', 'prototype', 'constructor'].includes(current.property.name))) return false;
                if (current.type === 'MemberExpression' && current.computed) return false;
                if (current.type === 'VariableDeclarator' || current.type === 'ExpressionStatement' || current.type === 'ReturnStatement') break;
            }
            return true;
        }
        documentIdentifiers.forEach(function(node) {
            var parent = parents.get(node);
            var isPlainPropertyKey = parent && parent.type === 'Property' && parent.key === node && !parent.computed;
            if (!isPlainPropertyKey && !isHarmlessTypeof(node) && !isDocumentUse(node)) documentUsesValid = false;
        });
        var results = Object.create(null);
        Object.keys(declarations).forEach(function(alias) {
            var declaration = styleDeclarations[alias];
            if (!documentUsesValid || !declaration) { results[alias] = false; return; }
            var writes = 0;
            var valid = true;
            (identifiers[alias] || []).forEach(function(node) {
                if (!valid || node === declaration.id) return;
                var member = parents.get(node);
                if (member && member.type === 'MemberExpression' && member.object === node && !member.computed &&
                    member.property && member.property.type === 'Identifier' &&
                    (member.property.name === 'textContent' || member.property.name === 'innerHTML' || member.property.name === 'innerText')) {
                    var assignment = parents.get(member);
                    if (!assignment || assignment.type !== 'AssignmentExpression' || assignment.operator !== '=' || assignment.left !== member) { valid = false; return; }
                    writes++;
                    return;
                }
                var call = member && member.type === 'CallExpression' ? member : null;
                var callee = call && call.callee;
                var head = callee && callee.type === 'MemberExpression' && !callee.computed && callee.property.type === 'Identifier' &&
                    ['appendChild', 'append'].includes(callee.property.name)
                    ? callee.object : null;
                var documentHead = head && head.type === 'MemberExpression' && !head.computed && head.property.type === 'Identifier' && head.property.name === 'head'
                    ? head.object : null;
                if (!call || !callee || !isStaticStyleAppend(call, callee, node) || !documentHead ||
                    documentHead.type !== 'Identifier' || documentHead.name !== 'document') { valid = false; return; }
                writes++;
            });
            results[alias] = valid && writes > 0;
        });
        return results;
    }
    function isStyleElementBinding(identifier) {
        if (!identifier || identifier.type !== 'Identifier') return false;
        if (!styleElementBindingIndex) styleElementBindingIndex = makeStyleElementBindingIndex();
        return styleElementBindingIndex[identifier.name] === true;
    }
    function isInlineCssContext(node) {
        var parent = parents.get(node);
        if (!parent) return false;
        if (parent.type === 'AssignmentExpression' && parent.operator === '=' && parent.right === node) {
            var left = parent.left;
            if (left.type !== 'MemberExpression' || left.computed || left.property.type !== 'Identifier') return false;
            if (left.property.name === 'cssText') {
                return left.object.type === 'MemberExpression' && !left.object.computed && left.object.property.type === 'Identifier' && left.object.property.name === 'style';
            }
            return (left.property.name === 'textContent' || left.property.name === 'innerHTML' || left.property.name === 'innerText') && isStyleElementBinding(left.object);
        }
        if (parent.type === 'CallExpression' && parent.arguments.indexOf(node) >= 2 && parent.arguments[0] &&
            parent.arguments[0].type === 'Literal' && parent.arguments[0].value === 'style') return isReactCreateElement(parent);
        return false;
    }
    function isClassNameLiteral(node) {
        var property = parents.get(node);
        return property && property.type === 'Property' && property.value === node &&
            ((property.key.type === 'Identifier' && property.key.name === 'className') ||
             (property.key.type === 'Literal' && property.key.value === 'className'));
    }
    function isWithinClassNameValue(node) {
        for (var current = parents.get(node); current; current = parents.get(current)) {
            if (current.type === 'Property')
                return current.key && ((current.key.type === 'Identifier' && current.key.name === 'className') ||
                    (current.key.type === 'Literal' && current.key.value === 'className'));
            if (current.type === 'VariableDeclarator' || current.type === 'ExpressionStatement' || current.type === 'ReturnStatement') return false;
        }
        return false;
    }
    function hasUnknownLegacyClassName(value) {
        var words = value.match(/[a-zA-Z_][a-zA-Z0-9_-]*/g) || [];
        return words.some(function(name) {
            var lower = name.toLowerCase();
            return (lower.indexOf('lcp-') >= 0 || lower.indexOf('lc-dialog') === 0) &&
                !Object.prototype.hasOwnProperty.call(styleMappings, name);
        });
    }
    function isBareLegacyClassName(value) {
        return /^\s*(?:lcp-[a-zA-Z0-9_-]+|lc-dialog[a-zA-Z0-9_-]*|cm-s-lcp-[a-zA-Z0-9_-]+)\s*$/i.test(value);
    }
    var inlineStyleChanges = [];
    function convertInlineCss(node) {
        if (!node || typeof node !== 'object') return;
        if (node.type === 'Literal' && typeof node.value === 'string') {
            var literalParent = parents.get(node);
            if (isInlineCssContext(node)) {
                var convertedCss = convertCssText(String(node.value));
                if (convertedCss !== node.value) inlineStyleChanges.push({start: node.start, end: node.end, text: JSON.stringify(convertedCss)});
            } else if (containsMappedClassName(node.value) && !isResource(node.value)) {
                if (isClassNameLiteral(node)) {
                    var mappedClassName = mapClassNames(node.value);
                    if (mappedClassName !== node.value) inlineStyleChanges.push({start: node.start, end: node.end, text: JSON.stringify(mappedClassName)});
                } else if (isWithinClassNameValue(node) || (literalParent && literalParent.type === 'CallExpression' && literalParent.arguments.indexOf(node) >= 0) ||
                    (literalParent && literalParent.type === 'ArrayExpression' && isWithinClassNameValue(literalParent))) {
                    throw new Error('包含无法安全转换的旧 UI 类名');
                } else if (isStyleReference(node.value)) {
                    throw new Error('包含旧 UI 样式引用，但脚本位置无法确认是静态 CSS');
                }
            } else if (isClassNameLiteral(node) && !isResource(node.value)) {
                if (hasUnknownLegacyClassName(node.value)) throw new Error('包含无法安全转换的旧 UI 类名');
            } else if (hasUnknownLegacyClassName(node.value) &&
                (isWithinClassNameValue(node) || (literalParent && literalParent.type === 'CallExpression' &&
                    literalParent.arguments.indexOf(node) >= 0 && isBareLegacyClassName(node.value)))) {
                throw new Error('包含无法安全转换的旧 UI 类名');
            } else if (isStyleReference(node.value) && !isResource(node.value)) {
                throw new Error('包含旧 UI 样式引用，但脚本位置无法确认是静态 CSS');
            }
        }
        if (node.type === 'TemplateLiteral') {
            var templateText = node.quasis.map(function(quasi) { return quasi.value.cooked || quasi.value.raw; }).join('');
            if (isInlineCssContext(node) && node.expressions.length === 0) {
                var convertedTemplateCss = convertCssText(templateText);
                if (convertedTemplateCss !== templateText) {
                    inlineStyleChanges.push({start: node.start, end: node.end, text: JSON.stringify(convertedTemplateCss)});
                }
            } else if (isInlineCssContext(node) && isStyleReference(templateText)) {
                throw new Error('包含动态脚本样式模板，无法安全转换');
            } else if (isClassNameLiteral(node) && !isResource(templateText)) {
                if (node.expressions.length === 0 && containsMappedClassName(templateText)) {
                    var mappedTemplateClassName = mapClassNames(templateText);
                    inlineStyleChanges.push({start: node.start, end: node.end, text: JSON.stringify(mappedTemplateClassName)});
                } else if (containsMappedClassName(templateText) || hasUnknownLegacyClassName(templateText)) {
                    throw new Error('包含动态旧 UI 类名，无法安全转换');
                }
            } else if (isStyleReference(templateText)) {
                throw new Error('包含旧 UI 样式引用，但脚本位置无法确认是静态 CSS');
            }
        }
        for (var key in node) {
            if (key === 'start' || key === 'end' || key === 'loc' || key === 'range' || key === 'raw' || key === 'type') continue;
            var child = node[key];
            if (Array.isArray(child)) for (var i = 0; i < child.length; i++) convertInlineCss(child[i]);
            else if (child && typeof child === 'object') convertInlineCss(child);
        }
    }
    convertInlineCss(tree);
    inlineStyleChanges.sort(function(a, b) { return b.start - a.start; });
    for (var cssIndex = 0; cssIndex < inlineStyleChanges.length; cssIndex++) {
        var cssChange = inlineStyleChanges[cssIndex];
        source = source.slice(0, cssChange.start) + cssChange.text + source.slice(cssChange.end);
    }
    if (inlineStyleChanges.length) {
        tree = acorn.parse(source, {ecmaVersion: 2022, sourceType: 'script'});
    }
    var forbidden = oldNames.concat([oldMarker, '__LCP_REMOTE_COMPONENT_BASE_URL_MAP__']);
    function containsLegacyToken(node) {
        if (!node || typeof node !== 'object') return false;
        var value = node.type === 'Identifier' ? node.name :
            node.type === 'Literal' && typeof node.value === 'string' ? node.value :
            node.type === 'TemplateElement' ? (node.value.cooked || node.value.raw) : null;
        if (value !== null) for (var n = 0; n < forbidden.length; n++)
            if (value.indexOf(forbidden[n]) >= 0) return true;
        for (var key in node) {
            if (key === 'start' || key === 'end' || key === 'loc' || key === 'range' || key === 'raw' || key === 'type') continue;
            var child = node[key];
            if (Array.isArray(child)) {
                for (var i = 0; i < child.length; i++) if (containsLegacyToken(child[i])) return true;
            } else if (containsLegacyToken(child)) return true;
        }
        return false;
    }
    if (!containsLegacyToken(tree)) return {source: source, legacy: inlineStyleChanges.length > 0};
    var prefixChanges = [];
    if (tree.body.length > 1) {
        // The legacy CLI prepends this exact asset bootstrap before its entry.
        // Recognize only the published template; do not interpret arbitrary code.
        var first = tree.body[0], lastPrefix = tree.body[tree.body.length - 2];
        if (first.type !== 'VariableDeclaration' || first.declarations.length !== 1 ||
            first.declarations[0].id.name !== '__LCP_REMOTE_ENTRY_FILE__' ||
            !first.declarations[0].init || first.declarations[0].init.type !== 'Literal' ||
            typeof first.declarations[0].init.value !== 'string') throw new Error('不支持的组件资源加载格式');
        var cssArrays = [];
        function findArrays(node) {
            if (!node || typeof node !== 'object') return;
            if (node.type === 'ArrayExpression') cssArrays.push(node);
            for (var key in node) {
                if (key === 'start' || key === 'end' || key === 'loc' || key === 'range' || key === 'raw' || key === 'type') continue;
                var child = node[key];
                if (Array.isArray(child)) for (var j = 0; j < child.length; j++) findArrays(child[j]);
                else if (child && typeof child === 'object') findArrays(child);
            }
        }
        findArrays(lastPrefix);
        if (cssArrays.length !== 1 || cssArrays[0].elements.some(function(e) { return !e || e.type !== 'Literal' || typeof e.value !== 'string'; }))
            throw new Error('不支持的组件资源加载格式');
        var entryName = first.declarations[0].init.value;
        var cssFiles = cssArrays[0].elements.map(function(e) { return e.value; });
        var bootstrap = [
            'var __LCP_REMOTE_ENTRY_FILE__=' + JSON.stringify(entryName) + ';',
            'var __LCP_REMOTE_CURRENT_SCRIPT__=typeof document!=="undefined"?document.currentScript:null;',
            'if(!__LCP_REMOTE_CURRENT_SCRIPT__&&typeof document!=="undefined"){var __LCP_REMOTE_SCRIPTS__=document.getElementsByTagName("script");for(var __LCP_REMOTE_I__=__LCP_REMOTE_SCRIPTS__.length-1;__LCP_REMOTE_I__>=0;__LCP_REMOTE_I__--){var __LCP_REMOTE_SRC__=__LCP_REMOTE_SCRIPTS__[__LCP_REMOTE_I__].src||__LCP_REMOTE_SCRIPTS__[__LCP_REMOTE_I__].getAttribute("src")||"";if(__LCP_REMOTE_SRC__.indexOf(__LCP_REMOTE_ENTRY_FILE__)>=0){__LCP_REMOTE_CURRENT_SCRIPT__=__LCP_REMOTE_SCRIPTS__[__LCP_REMOTE_I__];break}}}',
            'var __LCP_REMOTE_BASE_MAP__=typeof globalThis!=="undefined"&&globalThis.__LCP_REMOTE_COMPONENT_BASE_URL_MAP__||{};',
            'var __LCP_REMOTE_MAPPED_BASE_URL__=__LCP_REMOTE_BASE_MAP__[__LCP_REMOTE_ENTRY_FILE__]||"";',
            'var __LCP_REMOTE_SCRIPT_SRC__=__LCP_REMOTE_CURRENT_SCRIPT__&&(__LCP_REMOTE_CURRENT_SCRIPT__.src||__LCP_REMOTE_CURRENT_SCRIPT__.getAttribute("src"))||"";',
            'var __LCP_REMOTE_SCRIPT_BASE_URL__=__LCP_REMOTE_SCRIPT_SRC__&&__LCP_REMOTE_SCRIPT_SRC__.lastIndexOf("/")>=0?__LCP_REMOTE_SCRIPT_SRC__.slice(0,__LCP_REMOTE_SCRIPT_SRC__.lastIndexOf("/")+1):"";',
            'var __LCP_REMOTE_BASE_URL__=__LCP_REMOTE_MAPPED_BASE_URL__||__LCP_REMOTE_SCRIPT_BASE_URL__;',
            'var __LCP_REMOTE_ASSET_URL__=function(p){if(!p||/^(?:[a-z][a-z0-9+.-]*:|\\/)/i.test(p))return p;if(!__LCP_REMOTE_BASE_URL__)return p;return __LCP_REMOTE_BASE_URL__+p.replace(/^\\.\\//,"")};',
            '(function(){if(typeof document==="undefined")return;' + JSON.stringify(cssFiles) + '.forEach(function(p){var href=__LCP_REMOTE_ASSET_URL__(p);if(document.querySelector(\'link[data-lcp-remote-style="\'+href+\'"]\'))return;var link=document.createElement("link");link.rel="stylesheet";link.href=href;link.setAttribute("data-lcp-remote-style",href);document.head.appendChild(link);});})();',
            ''
        ].join('\n');
        var entryNode = tree.body[tree.body.length - 1];
        if (source.slice(0, entryNode.start) !== bootstrap) throw new Error('不支持的组件资源加载格式');
        prefixChanges.push({start: 0, end: entryNode.start, text: bootstrap.replace('globalThis.__LCP_REMOTE_COMPONENT_BASE_URL_MAP__', 'globalThis.__DATAVISOOL_REMOTE_COMPONENT_BASE_URL_MAP__').replace(/data-lcp-remote-style/g, 'data-datavisool-remote-style')});
    }
    var entry = tree.body[tree.body.length - 1];
    var call, changes = prefixChanges.slice(), requiresAssignment = false, markerAssignments = 0;
    if (entry && entry.type === 'VariableDeclaration' && entry.declarations.length === 1) {
        var decl = entry.declarations[0];
        if (decl.id.type !== 'Identifier' || decl.id.name !== oldMarker) throw new Error('不支持的组件入口格式');
        call = decl.init;
        changes.push({start: decl.id.start, end: decl.id.end, text: '__DATAVISOOL_REMOTE_COMPONENT_TEMP__'});
    } else if (entry && entry.type === 'ExpressionStatement') {
        call = entry.expression;
        requiresAssignment = true;
    } else throw new Error('不支持的组件入口格式');
    if (!call || call.type !== 'CallExpression' || call.callee.type !== 'FunctionExpression') throw new Error('不支持的组件入口格式');
    var fn = call.callee;
    var aliases = Object.create(null);
    for (var i=0; i<call.arguments.length; i++) {
        var arg=call.arguments[i];
        if (arg.type !== 'Identifier') throw new Error('不支持的组件依赖');
        var pos=oldNames.indexOf(arg.name);
        if (pos < 0) { if (arg.name !== 'React' && arg.name !== 'ReactDOM') throw new Error('不支持的组件依赖 ' + arg.name); continue; }
        var param=fn.params[i];
        if (!param || param.type !== 'Identifier' || aliases[param.name]) throw new Error('无法确定旧接口参数');
        aliases[param.name] = {index:pos, global:arg.name};
        changes.push({start:arg.start,end:arg.end,text:pos===2||pos===3?'DataVisoolUI':pos===5?'DataVisoolTypes':'DataVisoolSDK'});
    }
    function mapClassNames(value) {
        return value.split(/(\s+)/).map(function(name) {
            return Object.prototype.hasOwnProperty.call(styleMappings, name) ? styleMappings[name] : name;
        }).join('');
    }
    function containsMappedClassName(value) {
        var words = value.match(/[a-zA-Z_][a-zA-Z0-9_-]*/g) || [];
        return words.some(function(name) { return Object.prototype.hasOwnProperty.call(styleMappings, name); });
    }
    function containsAlias(node) {
        if (!node || typeof node !== 'object') return false;
        if (node.type === 'Identifier' && aliases[node.name]) return true;
        for (var key in node) {
            if (key === 'start' || key === 'end' || key === 'loc' || key === 'range' || key === 'raw' || key === 'type') continue;
            var child = node[key];
            if (Array.isArray(child)) {
                for (var i = 0; i < child.length; i++) if (containsAlias(child[i])) return true;
            } else if (containsAlias(child)) return true;
        }
        return false;
    }
    function visit(node, parent, key, shadow, grandparent, greatGrandparent) {
        if (!node || typeof node !== 'object') return;
        if ((node.type === 'CallExpression' || node.type === 'NewExpression') && node.callee && node.callee.type === 'Identifier' && (node.callee.name === 'eval' || node.callee.name === 'Function')) throw new Error('不支持动态执行的组件代码');
        if (node.type === 'Identifier' && node.name === oldMarker && parent && parent.type === 'MemberExpression' &&
            !parent.computed && parent.property === node && parent.object.type === 'Identifier' && parent.object.name === 'globalThis' &&
            grandparent && grandparent.type === 'AssignmentExpression' && grandparent.operator === '=' && grandparent.left === parent) {
            markerAssignments++;
            changes.push({start: node.start, end: node.end, text: '__DATAVISOOL_REMOTE_COMPONENT_TEMP__'});
        } else if (node.type === 'Identifier' && (oldNames.indexOf(node.name) >= 0 || node.name === oldMarker || node.name === 'LCPUI' || node.name === '__LCP_REMOTE_COMPONENT_BASE_URL_MAP__'))
            throw new Error('不支持的旧接口引用 ' + node.name);
        if (node.type === 'Literal' && typeof node.value === 'string') {
            var forbiddenNames = oldNames.concat([oldMarker, 'LCPUI', '__LCP_REMOTE_COMPONENT_BASE_URL_MAP__']);
            for (var n = 0; n < forbiddenNames.length; n++) if (node.value.indexOf(forbiddenNames[n]) >= 0)
                throw new Error('无法确认旧接口位置 ' + forbiddenNames[n]);
            if (containsMappedClassName(node.value)) {
                var className = parent && parent.type === 'Property' && key === 'value' &&
                    ((!parent.computed && parent.key.type === 'Identifier' && parent.key.name === 'className') ||
                     (parent.key.type === 'Literal' && parent.key.value === 'className'));
                if (!className || mapClassNames(node.value) === node.value)
                    throw new Error('包含无法安全转换的旧 UI 类名');
                changes.push({start: node.start, end: node.end, text: JSON.stringify(mapClassNames(node.value))});
            } else if (hasUnknownLegacyClassName(node.value) &&
                (isClassNameLiteral(node) || (parent && parent.type === 'CallExpression' && key === 'arguments'))) {
                throw new Error('包含无法安全转换的旧 UI 类名');
            }
        }
        if (node.type === 'TemplateElement') {
            var template = node.value.cooked || node.value.raw;
            for (var t = 0; t < forbidden.length; t++) if (template.indexOf(forbidden[t]) >= 0)
                throw new Error('无法确认旧接口位置 ' + forbidden[t]);
            if (containsMappedClassName(template)) throw new Error('包含无法安全转换的旧 UI 类名');
        }
        if (node.type === 'MemberExpression' && node.computed && node.object.type === 'Identifier' &&
            ['window', 'globalThis', 'self'].indexOf(node.object.name) >= 0 && node.property.type !== 'Literal')
            throw new Error('不支持动态访问全局对象');
        var shadows=shadow;
        if (node !== fn && (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression')) {
            shadows=Object.create(shadow);
            for (var z=0;z<node.params.length;z++) {
                if (node.params[z].type === 'Identifier') shadows[node.params[z].name]=true;
                else {
                    if (containsAlias(node.params[z])) throw new Error('不支持旧接口参数遮蔽');
                }
            }
        }
        if (node.type === 'Identifier' && aliases[node.name] && !shadows[node.name]) {
            var alias=aliases[node.name];
            if (parent && parent.type==='MemberExpression' && key==='object' && !parent.computed && parent.property.type==='Identifier') {
                var prop=parent.property.name;
                if (alias.index === 1 && prop === 'FetchUtil')
                    throw new Error('旧组件使用了 FetchUtil；共享 SDK 未提供对应网络工具，不支持自动转换，无法导入');
                if (allowed[alias.index].indexOf(prop)<0) throw new Error('不支持旧接口 '+alias.global+'.'+prop);
                if ((alias.index===2 || alias.index===3) && renamedUiMembers[prop]) changes.push({start:parent.property.start,end:parent.property.end,text:renamedUiMembers[prop]});
                if (alias.index===1) {
                    if (!grandparent || grandparent.type !== 'MemberExpression' || grandparent.object !== parent || grandparent.computed || grandparent.property.type !== 'Identifier')
                        throw new Error('不支持旧接口 LightChaserUtil.' + prop + ' 的动态访问或别名');
                    if (utilityMethods[prop].indexOf(grandparent.property.name) < 0)
                        throw new Error('不支持旧接口 LightChaserUtil.' + prop + '.' + grandparent.property.name);
                    if (prop === 'ObjectUtil' && grandparent.property.name === 'merge') {
                        if (!greatGrandparent || greatGrandparent.type !== 'CallExpression' || greatGrandparent.callee !== grandparent)
                            throw new Error('不支持旧接口 LightChaserUtil.ObjectUtil.merge 的动态访问或别名');
                    }
                }
            } else if (parent && parent.type==='Property' && key==='key' && !parent.computed && !parent.shorthand) {
                // An object property name, not a reference.
            } else {
                throw new Error('不支持旧接口的动态访问或别名 '+alias.global);
            }
        }
        for (var k in node) {
            if (k==='start'||k==='end'||k==='loc'||k==='range'||k==='raw'||k==='type') continue;
            var child=node[k];
            if (Array.isArray(child)) { for(var j=0;j<child.length;j++) visit(child[j],node,k,shadows,parent,grandparent); }
            else if(child && typeof child==='object') visit(child,node,k,shadows,parent,grandparent);
        }
    }
    visit(fn.body,fn,'body',Object.create(null));
    if (requiresAssignment && markerAssignments !== 1) throw new Error('无法确定旧组件注册位置');
    changes.sort(function(a,b){return b.start-a.start});
    var result=source;
    for (i=0;i<changes.length;i++) result=result.slice(0,changes[i].start)+changes[i].text+result.slice(changes[i].end);
    return {source: result, legacy: true};
}
