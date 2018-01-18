'use strict';

const Datastore = require('@google-cloud/datastore');
const chai = require('chai');
const sinon = require('sinon');

const ds = new Datastore();

const { expect } = chai;
const { createDataLoader } = require('../lib/dataloader');

describe('dataloader', () => {
    it('should create a dataloader instance', () => {
        const loader = createDataLoader(ds);
        expect(loader.constructor.name).equal('DataLoader');
    });

    it('should throw an error if no datastore instance passed', () => {
        const fn = () => createDataLoader();

        expect(fn).throw('A Datastore instance has to be passed');
    });

    it('should pass the keys to the datastore "get" method and preserve Order', () => {
        const key1 = ds.key(['User', 123]);
        const key2 = ds.key(['User', 456]);
        const key3 = ds.key({
            namespace: 'ns-test',
            path: ['User', 789],
        });

        const entity1 = { name: 'John 1' };
        const entity2 = { name: 'John 2' };
        const entity3 = { name: 'John 3' };

        entity1[ds.KEY] = key1;
        entity2[ds.KEY] = key2;
        entity3[ds.KEY] = key3;

        sinon.stub(ds, 'get').resolves([entity3, entity2, entity1]);

        const loader = createDataLoader(ds);

        return Promise.all([loader.load(key1), loader.load(key2), loader.load(key3)])
            .then((res) => {
                expect(res[0][ds.KEY].id).equal(123);
                expect(res[1][ds.KEY].id).equal(456);
                expect(res[2][ds.KEY].id).equal(789);
            });
    });
});
