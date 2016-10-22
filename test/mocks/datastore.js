'use strict';

const is = require('is');
let googleDatastore;

class Datastore {
    
    constructor(options) {
        googleDatastore = require('@google-cloud/datastore')(options);
    }

    key(options) {
        return googleDatastore.key(options);
    }

    save(entity, cb) {
        return cb(null);
    }

    get(entityKey, cb) {
        return cb(null);
    }

    delete(key, cb) {
        return cb(null);
    }

    createQuery() {
        return googleDatastore.createQuery.apply(googleDatastore, arguments);
    }

    runQuery(namespace, query, cb) {
        return cb(null, [], {moreResults : 'MORE_RESULT'});
    }

    transaction() {
        return {};
    }

    int() {
        return googleDatastore.int.apply(googleDatastore, arguments);
    }

    double() {
        return googleDatastore.double.apply(googleDatastore, arguments);
    }

    geoPoint() {
        return googleDatastore.geoPoint.apply(googleDatastore, arguments);
    }

    get MORE_RESULTS_AFTER_LIMIT() {
        return googleDatastore.MORE_RESULTS_AFTER_LIMIT;
    }

    get MORE_RESULTS_AFTER_CURSOR() {
        return googleDatastore.MORE_RESULTS_AFTER_CURSOR;
    }

    get NO_MORE_RESULTS() {
        return googleDatastore.NO_MORE_RESULTS;
    }

    get KEY() {
        return googleDatastore.KEY;
    }
}

module.exports = function(options) {
    return new Datastore(options);
}