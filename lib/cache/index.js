'use strict';

const cacheManager = require('cache-manager');
const arrify = require('arrify');

const defaultConfig = {
    store: 'memory',
    max: 100,
    ttl: 600, // 10 minutes
};

const init = (config) => {
    if (!config) {
        return undefined;
    }

    if (config === true) {
        config = Object.assign({}, defaultConfig);
    }

    return cacheManager.caching(defaultConfig);
};

const getKeys = (keys, cache) => {
    keys = arrify(keys);

    // if (keys.length === 1) {
    // }

    // let stringKey;
    // return new Promise((resolve, reject) => {
    //     stringKey = googleCloud.key.toString(key);

    //     _this.gstore.cache.get(stringKey, (err, result) => {
    //         if (err) {
    //             return reject(err);
    //         }

    //         if (result !== null && result !== undefined) {
    //             return resolve(result);
    //         }

    //         return fetchEntity().then(resolve, reject);
    //     });
    // });

    // Todo...
};

const getQuery = (query, cache) => {

};


module.exports = {
    init,
    getKeys,
    getQuery,
};
