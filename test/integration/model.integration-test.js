/* eslint-disable no-unused-expressions */

'use strict';

const Datastore = require('@google-cloud/datastore');
const chai = require('chai');
const { argv } = require('yargs');
const gstore = require('../../lib')();

const ds = new Datastore({ projectId: 'gstore-integration-tests' });
gstore.connect(ds);

const { expect } = chai;
const { Schema } = gstore;
const {
    k1, k2, k3, k4, user1,
} = require('./data');

const allKeys = [k1, k2, k3, k4];

const cleanUp = (cb) => {
    ds.delete(allKeys).then(cb);
};

const addKey = (key) => {
    if (key) {
        allKeys.push(key);
    }
};

describe('Integration Tests (Model)', () => {
    beforeEach(function integrationTest() {
        if (argv.int !== true) {
            // Skip e2e tests suite
            this.skip();
        }
    });

    afterEach((done) => {
        cleanUp(() => done());
    });

    it('check that Local Datastore is up and running', () =>
        ds.get(k1).then((res) => {
            expect(typeof res[0]).equal('undefined');

            return ds
                .save({ key: k1, data: user1 })
                .then(() => ds.get(k1))
                .then((res2) => {
                    expect(res2[0]).deep.equal(user1);
                });
        }));

    it('Schema.read set to false should work as expected', () => {
        const schema = new Schema({
            email: {
                type: 'string',
                validate: 'isEmail',
                required: true,
            },
            password: {
                type: 'string',
                validate: {
                    rule: 'isLength',
                    args: [{ min: 8, max: undefined }],
                },
                required: true,
                read: false,
                excludeFromIndexes: true,
            },
            state: {
                type: 'string',
                default: 'requested',
                write: false,
                read: false,
                excludeFromIndexes: true,
            },
        });

        const User = gstore.model('User', schema);
        const user = new User({ email: 'test@test.com', password: 'abcd1234' });

        user.save().then((entity) => {
            addKey(entity.entityKey);
            const response = entity.plain();
            expect(response.password).to.not.exist;
            expect(response.requested).to.not.exist;

            const response2 = entity.plain({ readAll: true });
            expect(response2.password).equal('abcd1234');
            expect(response2.state).equal('requested');
        });
    });
});
