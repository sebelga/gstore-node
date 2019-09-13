'use strict';

import is from 'is';

class VirtualType {
    constructor(name, options) {
        this.name = name;
        this.getter = null;
        this.setter = null;
        this.options = options || {};
    }

    get(fn) {
        if (!is.fn(fn)) {
            throw new Error('You need to pass a function to virtual get');
        }
        this.getter = fn;
        return this;
    }

    set(fn) {
        if (!is.fn(fn)) {
            throw new Error('You need to pass a function to virtual set');
        }
        this.setter = fn;
        return this;
    }

    applyGetters(scope) {
        if (this.getter === null) {
            return null;
        }
        const v = this.getter.call(scope);
        scope[this.name] = v;
        return v;
    }

    applySetters(value, scope) {
        if (this.setter === null) {
            return null;
        }
        const v = this.setter.call(scope, value);
        return v;
    }
}

export default VirtualType;
