/* eslint-disable no-unused-expressions */

'use strict';

const Datastore = require('@google-cloud/datastore');
const redisStore = require('cache-manager-redis-store');
const chai = require('chai');
const { argv } = require('yargs');
const gstore = require('../../lib')({
    namespace: 'gstore-with-redis-cache',
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

const ds = new Datastore({ projectId: 'gstore-cache-integration-tests' });
gstore.connect(ds);

const { expect } = chai;
const { Schema } = gstore;
const { cleanUp, addKey } = require('./data')(ds);

describe('Integration Tests (Cache)', () => {
    let schema;
    let Model;

    beforeEach(function integrationTest() {
        if (argv.int !== true) {
            // Skip e2e tests suite
            this.skip();
        }
        gstore.models = {};
        gstore.modelSchemas = {};

        schema = new Schema({
            email: {
                type: String,
                validate: 'isEmail',
                required: true,
            },
        });

        Model = gstore.model('User', schema);
    });

    afterEach((done) => {
        cleanUp(() => done());
    });

    it('should set KEY symbol on query result', () => {
        const user = new Model({ email: 'test@test.com' });

        return user.save().then((entity) => {
            addKey(entity.entityKey);
            return Model.get(entity.entityKey.id)
                .then((e) => {
                    expect(e.email).equal('test@test.com');
                });
        });
    });
});
