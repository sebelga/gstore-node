'use strict';

const ds = require('@google-cloud/datastore');

class Datastore {

    constructor(options) {
        this.googleDatastore = ds(options);
    }

    key(options) {
        return this.googleDatastore.key(options);
    }

    save() {
        return Promise.resolve(this);
    }

    get() {
        return Promise.resolve(this);
    }

    delete() {
        return Promise.resolve(this);
    }

    createQuery() {
        return this.googleDatastore.createQuery.apply(this.googleDatastore, arguments);
    }

    runQuery() {
        return Promise.resolve([[], { moreResults: 'MORE_RESULT', __ref: this }]);
    }

    transaction() {
        return { __ref: this };
    }

    int() {
        return this.googleDatastore.int.apply(this.googleDatastore, arguments);
    }

    double() {
        return this.googleDatastore.double.apply(this.googleDatastore, arguments);
    }

    geoPoint() {
        return this.googleDatastore.geoPoint.apply(this.googleDatastore, arguments);
    }

    get MORE_RESULTS_AFTER_LIMIT() {
        return this.googleDatastore.MORE_RESULTS_AFTER_LIMIT;
    }

    get MORE_RESULTS_AFTER_CURSOR() {
        return this.googleDatastore.MORE_RESULTS_AFTER_CURSOR;
    }

    get NO_MORE_RESULTS() {
        return this.googleDatastore.NO_MORE_RESULTS;
    }

    get KEY() {
        return this.googleDatastore.KEY;
    }
}

module.exports = options => new Datastore(options);
