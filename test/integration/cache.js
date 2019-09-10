/* eslint-disable no-unused-expressions */

'use strict';

const redisStore = require('cache-manager-redis-store');
const chai = require('chai');
const Chance = require('chance');
const { Datastore } = require('@google-cloud/datastore');
const { argv } = require('yargs');

const { Gstore } = require('../../lib');

const ds = new Datastore({ projectId: 'gstore-integration-tests' });
const chance = new Chance();
const { expect } = chai;

const allKeys = [];

const cleanUp = cb => {
    ds.delete(allKeys).then(cb);
};

const addKey = key => {
    if (key) {
        allKeys.push(key);
    }
};

describe('Integration Tests (Cache)', () => {
    let gstore;
    let schema;
    let Schema;
    let Model;

    beforeEach(function integrationTest() {
        if (argv.int !== true) {
            // Skip e2e tests suite
            this.skip();
        }
        if (!gstore) {
            gstore = new Gstore({
                cache: {
                    stores: [{
                        store: redisStore,
                    }],
                    config: {
                        ttl: {
                            keys: 600,
                            queries: 600,
                        },
                    },
                },
            });
            gstore.connect(ds);
        }

        ({ Schema } = gstore);

        gstore.models = {};
        gstore.modelSchemas = {};

        schema = new Schema({
            email: {
                type: String,
                validate: 'isEmail',
                required: true,
            },
        });

        Model = gstore.model('CacheTests-User', schema);
    });

    afterEach(done => {
        cleanUp(() => done());
    });

    it('should set KEY symbol on query result', () => {
        const id = chance.string({ pool: 'abcdefghijklmnopqrstuvwxyz0123456789' });
        const user = new Model({ email: 'test@test.com' }, id);
        return user.save().then(entity => {
            addKey(entity.entityKey);
            return Model.get(entity.entityKey.name)
                .then(e => {
                    expect(e.email).equal('test@test.com');
                });
        });
    });
});
