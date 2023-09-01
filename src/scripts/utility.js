const wrap = {};

/** 
 * @param {Function} first
 * @param {Function} second
 */
wrap.sequenced = function(first, second) {
    return function(...args) {
        const intermediate = first.call(this, ...args);
        
        // if the first returned a promise, return promise of second chained
        // after first. otherwise just return the result of second (which may
        // or may not be a promise)
        if (intermediate?.then) {
            return intermediate.then(() => second.call(this, ...args));
        } else {
            return second.call(this, ...args);
        }
    }
}

wrap.before = function(object, method, callback) {
    const original = object[method];
    object[method] = wrap.sequenced(callback, original);
}

wrap.after = function(object, method, callback) {
    const original = object[method];
    object[method] = wrap.sequenced(original, callback);
}

wrap.replace = function(object, method, callback) {
    object[method] = callback;
}

wrap.splice = function(object, method, callback) {
    const original = object[method];

    object[method] = function (...args) {
        return callback.call(this, original, ...args);
    };
}
