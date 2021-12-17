"use strict";

function perfectJson(item) {

  function arrayValuesAreExpandedObjects(values) {
    for (var i = 0; i < values.length; i++) {
      if (!/^[[{]\n/.test(values[i])) {
        return false;
      }
    }
  
    return true;
  }
  
  function getIndentChars(depth, indent) {
    return new Array(depth * indent + 1).join(' ');
  }

  function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) { symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); } keys.push.apply(keys, symbols); } return keys; }

  function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(Object(source), true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

  function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

  var options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
  var recursiveOptions = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
  var _options$indent = options.indent,
      indent = _options$indent === void 0 ? 2 : _options$indent,
      _options$compact = options.compact,
      compact = _options$compact === void 0 ? true : _options$compact,
      singleLine = options.singleLine,
      maxLineLength = options.maxLineLength,
      _options$arrayMargin = options.arrayMargin,
      arrayMargin = _options$arrayMargin === void 0 ? '' : _options$arrayMargin,
      _options$objectMargin = options.objectMargin,
      objectMargin = _options$objectMargin === void 0 ? ' ' : _options$objectMargin,
      split = options.split,
      splitResult = options.splitResult;
  var key = recursiveOptions.key,
      _recursiveOptions$pat = recursiveOptions.path,
      path = _recursiveOptions$pat === void 0 ? [] : _recursiveOptions$pat,
      _recursiveOptions$ite = recursiveOptions.items,
      items = _recursiveOptions$ite === void 0 ? [] : _recursiveOptions$ite,
      _recursiveOptions$dep = recursiveOptions.depth,
      depth = _recursiveOptions$dep === void 0 ? 0 : _recursiveOptions$dep,
      _recursiveOptions$spl = recursiveOptions.splitted,
      splitted = _recursiveOptions$spl === void 0 ? {} : _recursiveOptions$spl;
  var _recursiveOptions$spl2 = recursiveOptions.splitDepth,
      splitDepth = _recursiveOptions$spl2 === void 0 ? 0 : _recursiveOptions$spl2;

  if (item === undefined) {
    return 'undefined';
  }

  if (item === null) {
    return 'null';
  }

  if (typeof item === 'string') {
    return "\"".concat(item, "\"");
  }

  if (typeof item === 'boolean' || typeof item === 'number') {
    return "".concat(item);
  }

  var itemOpts = {
    key: key,
    value: item,
    path: path,
    items: items,
    depth: depth,
    indent: indent
  };
  var splitPlaceholder = typeof key === 'string' && typeof split === 'function' ? split(itemOpts) : null;

  if (splitPlaceholder) {
    if (splitted[splitPlaceholder] !== undefined) {
      throw new Error("Placeholder \"".concat(splitPlaceholder, "\" is already used"));
    }

    splitDepth = 0;
  }

  var perfectify = function perfectify(key, value) {
    return perfectJson(value, options, {
      key: key,
      path: path.concat([key]),
      items: items.concat([item]),
      depth: depth + 1,
      splitDepth: splitDepth + 1,
      splitted: splitted
    });
  };

  var baseIndentChars = getIndentChars(depth, indent);
  var prefixIndentChars = key === undefined ? baseIndentChars : '';
  var open, close, margin, values;

  if (Array.isArray(item)) {
    if (item.length === 0) {
      return "".concat(prefixIndentChars, "[]");
    }

    open = '[';
    close = ']';
    margin = arrayMargin;
    values = item.map(function (value, key) {
      return perfectify(key, value);
    });
  } else {
    var keys = Object.keys(item);

    if (keys.length === 0) {
      return "".concat(prefixIndentChars, "{}");
    }

    open = '{';
    close = '}';
    margin = objectMargin;
    values = keys.map(function (key) {
      return "\"".concat(key, "\": ").concat(perfectify(key, item[key]));
    });
  }

  var line = "".concat(open).concat(margin).concat(values.join(', ')).concat(margin).concat(close);
  var result;

  if (typeof singleLine === 'boolean' && singleLine || typeof singleLine === 'function' && singleLine(_objectSpread(_objectSpread({}, itemOpts), {}, {
    line: line
  })) || typeof maxLineLength === 'number' && line.length + baseIndentChars.length <= maxLineLength) {
    result = line;
  } else {
    var list;

    if (Array.isArray(item) && arrayValuesAreExpandedObjects(values) && compact) {
      var replaceIndent = splitPlaceholder ? (splitDepth + 1) * indent : indent;
      var replaceRegExp = new RegExp("\\n {".concat(replaceIndent, "}"), 'g');
      list = '';

      for (var i = 0; i < values.length; i++) {
        if (list) {
          list += ', ';
        }

        list += values[i].replace(replaceRegExp, '\n');
      }
    } else {
      var baseSpace = getIndentChars(splitDepth, indent);
      var nestedSpace = getIndentChars(splitDepth + 1, indent);
      list = "\n".concat(values.map(function (value) {
        return "".concat(nestedSpace).concat(value);
      }).join(',\n'), "\n").concat(baseSpace);
    }

    result = "".concat(prefixIndentChars).concat(open).concat(list).concat(close);
  }

  if (splitPlaceholder) {
    splitted[splitPlaceholder] = result;
  }

  if (depth === 0 && typeof splitResult === 'function') {
    splitResult(splitted);
  }

  return splitPlaceholder ? "\"".concat(splitPlaceholder, "\"") : result;
}