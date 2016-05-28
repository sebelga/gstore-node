var chai   = require('chai');
var expect = chai.expect;
var gcloud = require('gcloud');
var ds     = gcloud.datastore();

var queryHelpers = require('../../lib/helper').QueryHelpers;

describe('Query Helpers', () => {
    "use strict";

    describe('should build a Query from options', () => {
        it ('and throw error if no query passed', () => {
            let fn = () => {queryHelpers.buildFromOptions();};

            expect(fn).to.throw(Error);
        });

        it ('and throw error if query is not a gcloud Query', () => {
            let fn = () => {queryHelpers.buildFromOptions({});};

            expect(fn).to.throw(Error);
        });

        it ('and not modify query if no options passed', () => {
            let query         = ds.createQuery();
            let originalQuery = {};
            Object.keys(query).forEach((k) => {
                originalQuery[k] = query[k];
            });

            query = queryHelpers.buildFromOptions(query);

            expect(query.filters).deep.equal(originalQuery.filters);
            expect(query.limitVal).equal(originalQuery.limitVal);
            expect(query.orders).deep.equal(originalQuery.orders);
            expect(query.selectVal).deep.equal(originalQuery.selectVal);
        });

        it ('and update query', () => {
            let query = ds.createQuery();
            let options = {
                limit : 10,
                order : {property:'name', descending:true},
                select : 'name'
            };

            query = queryHelpers.buildFromOptions(query, options);

            expect(query.limitVal).equal(options.limit);
            expect(query.orders.length).equal(1);
            expect(query.orders[0].name).equal('name');
            expect(query.orders[0].sign).equal('-');
            expect(query.selectVal).deep.equal(['name']);
        });

        it ('and allow order on serveral properties', () => {
            let query = ds.createQuery();
            let options = {
                order : [{property:'name', descending:true}, {property:'age'}]
            };

            query = queryHelpers.buildFromOptions(query, options);

            expect(query.orders.length).equal(2);
        });

        it ('and allow select to be an Array', () => {
            let query = ds.createQuery();
            let options = {
                select : ['name', 'lastname', 'email']
            };

            query = queryHelpers.buildFromOptions(query, options, ds);

            expect(query.selectVal).deep.equal(options.select);
        });

        it ('and update hasAncestor in query', () => {
            let query = ds.createQuery();
            let options = {
                ancestors: ['Parent', 123]
            };

            query = queryHelpers.buildFromOptions(query, options, ds);

            expect(query.filters[0].op).equal('HAS_ANCESTOR');
            expect(query.filters[0].val.kind).equal('Parent');
            expect(query.filters[0].val.id).equal(123);
        });

        it ('and throw Error if no Datastore instance passed when passing ancestors', () => {
            let query = ds.createQuery();
            let options = {
                ancestors: ['Parent', 123]
            };

            let fn = () => {
                query = queryHelpers.buildFromOptions(query, options);
            };

            expect(fn).to.throw(Error);
        });

        it ('and define one filter', () => {
            let query = ds.createQuery();
            let options = {
                filters: ['name', '=', 'John']
            };

            query = queryHelpers.buildFromOptions(query, options, ds);

            expect(query.filters.length).equal(1);
            expect(query.filters[0].name).equal('name');
            expect(query.filters[0].op).equal('=');
            expect(query.filters[0].val).equal('John');
        });

        it ('and define several filters', () => {
            let query = ds.createQuery();
            let options = {
                filters: [['name', '=', 'John'], ['lastname', 'Snow'], ['age', '<', 30]]
            };

            query = queryHelpers.buildFromOptions(query, options, ds);

            expect(query.filters.length).equal(3);
            expect(query.filters[1].name).equal('lastname');
            expect(query.filters[1].op).equal('=');
            expect(query.filters[1].val).equal('Snow');
            expect(query.filters[2].op).equal('<');
        });

        it ('and throw error if wrong format for filters', () => {
            let query = ds.createQuery();
            let options = {
                filters: 'name'
            };
            let fn = () => {
                query = queryHelpers.buildFromOptions(query, options, ds);
            };

            expect(fn).to.throw(Error);
        });
    });
});
