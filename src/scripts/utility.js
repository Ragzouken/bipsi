const wrap = {};

wrap.before = function(object, method, callback) {
    const original = object[method];

    object[method] = async function (...args) {
        await callback.call(this, ...args);
        const result = await original.call(this, ...args);
        return result;
    };
}

wrap.after = function(object, method, callback) {
    const original = object[method];

    object[method] = async function (...args) {
        const result = await original.call(this, ...args);
        await callback.call(this, ...args);
        return result;
    };
}

wrap.replace = function(object, method, callback) {
    object[method] = async function (...args) {
        return callback.call(this, ...args);
    };
}

wrap.splice = function(object, method, callback) {
    const original = object[method];

    object[method] = async function (...args) {
        return callback.call(this, original, ...args);
    };
}
