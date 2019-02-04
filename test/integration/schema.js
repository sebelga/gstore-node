/* eslint-disable no-unused-expressions */

'use strict';

const chai = require('chai');
const Chance = require('chance');
const { Datastore } = require('@google-cloud/datastore');
const { argv } = require('yargs');
const { Gstore } = require('../../lib');

const gstore = new Gstore();
const chance = new Chance();
const ds = new Datastore({ projectId: 'gstore-integration-tests' });
gstore.connect(ds);

const { expect } = chai;
const { Schema } = gstore;

describe('Schema (Integration Tests)', () => {
    beforeEach(function integrationTest() {
        gstore.models = {};
        gstore.modelSchemas = {};

        if (argv.int !== true) {
            // Skip e2e tests suite
            this.skip();
        }
    });

    it('read param set to "false" should not return those properties from entity.plain()', () => {
        const schema = new Schema({
            email: {
                type: String,
                required: true,
            },
            password: {
                type: String,
                validate: {
                    rule: 'isLength',
                    args: [{ min: 8, max: undefined }],
                },
                required: true,
                read: false,
                excludeFromIndexes: true,
            },
            state: {
                type: String,
                default: 'requested',
                write: false,
                read: false,
                excludeFromIndexes: true,
            },
        });

        const User = gstore.model('ModelTestsSchema-User', schema);

        const email = chance.email();
        const password = chance.string({ length: 10 });
        const user = new User({ email, password });

        return user.save().then((entity) => {
            const response = entity.plain();
            expect(response.password).to.not.exist;
            expect(response.requested).to.not.exist;

            const response2 = entity.plain({ readAll: true });
            expect(response2.password).equal(password);
            expect(response2.state).equal('requested');
        }).catch((err) => {
            throw (err);
        });
    });
});
