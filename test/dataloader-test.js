'use strict';

const Datastore = require('@google-cloud/datastore');
const chai = require('chai');
const sinon = require('sinon');

const gstore = require('../lib/index')();
const { createDataLoader } = require('../lib/dataloader');

const { expect, assert } = chai;
const ds = new Datastore();

describe('dataloader', () => {
    it('should read the ds instance from gstore', () => {
        gstore.connect(ds);
        const loader = gstore.createDataLoader();
        assert.isDefined(loader);
    });

    it('should create a dataloader instance', () => {
        const loader = createDataLoader(ds);
        expect(loader.constructor.name).equal('DataLoader');
        expect(loader._options.maxBatchSize).equal(1000);
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

        sinon.stub(ds, 'get').resolves([[entity3, entity2, entity1]]);

        const loader = createDataLoader(ds);

        return Promise.all([loader.load(key1), loader.load(key2), loader.load(key3)])
            .then((res) => {
                expect(res[0][ds.KEY].id).equal(123);
                expect(res[1][ds.KEY].id).equal(456);
                expect(res[2][ds.KEY].id).equal(789);
            });
    });

    it('should return "null" for entities not found', () => {
        const key1 = ds.key(['User', 123]);
        const key2 = ds.key(['User', 456]);
        const key3 = ds.key(['User', 789]);
        const entity = { name: 'John' };
        entity[ds.KEY] = key2;

        ds.get.resolves([[entity]]);

        const loader = createDataLoader(ds);

        return Promise.all([loader.load(key1), loader.load(key2), loader.load(key3)])
            .then((res) => {
                expect(res[0]).equal(null);
                expect(res[1][ds.KEY].id).equal(456);
                expect(res[2]).equal(null);
            });
    });

    it('should bypass sort if only 1 key', () => {
        const entity = { name: 'John' };
        const key = ds.key(['User', 123]);
        entity[ds.KEY] = key;
        ds.get.resolves([[entity]]);

        const loader = createDataLoader(ds);

        return loader.load(key)
            .then((res) => {
                expect(res[ds.KEY].id).equal(123);
            });
    });
});
