import chai from 'chai';
import sinon from 'sinon';
import { Datastore } from '@google-cloud/datastore';

import queryHelpers from './queryhelpers';
import { GstoreQuery } from '../query';

const ds = new Datastore();
const { expect } = chai;

describe('Query Helpers', () => {
  let query: GstoreQuery<any, any>;

  describe('should build a Query from options', () => {
    beforeEach(() => {
      query = ds.createQuery() as any;
    });

    test('and throw error if no query passed', () => {
      const fn = (): void => {
        // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
        // @ts-ignore
        queryHelpers.buildQueryFromOptions();
      };

      expect(fn).to.throw(Error);
    });

    test('and throw error if query is not a gcloud Query', () => {
      const fn = (): void => {
        // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
        // @ts-ignore
        queryHelpers.buildQueryFromOptions({});
      };

      expect(fn).to.throw(Error);
    });

    test('and not modify query if no options passed', () => {
      const originalQuery: any = {};
      Object.keys(query).forEach(k => {
        originalQuery[k] = (query as any)[k];
      });

      query = queryHelpers.buildQueryFromOptions(query);

      expect(query.filters).deep.equal(originalQuery.filters);
      expect(query.limitVal).equal(originalQuery.limitVal);
      expect(query.orders).deep.equal(originalQuery.orders);
      expect(query.selectVal).deep.equal(originalQuery.selectVal);
    });

    test('and update query', () => {
      const options = {
        limit: 10,
        order: { property: 'name', descending: true },
        filters: [],
        select: 'name',
      };

      query = queryHelpers.buildQueryFromOptions(query, options);

      expect(query.limitVal).equal(options.limit);
      expect(query.orders.length).equal(1);
      expect(query.orders[0].name).equal('name');
      expect(query.orders[0].sign).equal('-');
      expect(query.selectVal).deep.equal(['name']);
    });

    test('and allow order on serveral properties', () => {
      const options = {
        order: [{ property: 'name', descending: true }, { property: 'age' }],
      };

      query = queryHelpers.buildQueryFromOptions(query, options);

      expect(query.orders.length).equal(2);
    });

    test('and allow select to be an Array', () => {
      const options = {
        select: ['name', 'lastname', 'email'],
      };

      query = queryHelpers.buildQueryFromOptions(query, options, ds);

      expect(query.selectVal).deep.equal(options.select);
    });

    test('and update hasAncestor in query', () => {
      const options = {
        ancestors: ['Parent', 1234],
      };

      query = queryHelpers.buildQueryFromOptions(query, options, ds);

      expect(query.filters[0].op).equal('HAS_ANCESTOR');
      expect(query.filters[0].val.kind).equal('Parent');
      expect(query.filters[0].val.id).equal(1234);
    });

    test('and throw Error if no Datastore instance passed when passing ancestors', () => {
      const options = {
        ancestors: ['Parent', 123],
      };

      const fn = (): void => {
        query = queryHelpers.buildQueryFromOptions(query, options);
      };

      expect(fn).to.throw(Error);
    });

    test('and define one filter', () => {
      const options = {
        filters: ['name', '=', 'John'] as any[],
      };

      query = queryHelpers.buildQueryFromOptions(query, options, ds);

      expect(query.filters.length).equal(1);
      expect(query.filters[0].name).equal('name');
      expect(query.filters[0].op).equal('=');
      expect(query.filters[0].val).equal('John');
    });

    test('and define several filters', () => {
      const options = {
        filters: [['name', '=', 'John'], ['lastname', 'Snow'], ['age', '<', 30]],
      };

      query = queryHelpers.buildQueryFromOptions(query, options, ds);

      expect(query.filters.length).equal(3);
      expect(query.filters[1].name).equal('lastname');
      expect(query.filters[1].op).equal('=');
      expect(query.filters[1].val).equal('Snow');
      expect(query.filters[2].op).equal('<');
    });

    test('and execute a function in a filter value, without modifying the filters Array', () => {
      const spy = sinon.spy();
      const options = {
        filters: [['modifiedOn', '<', spy]],
      };

      query = queryHelpers.buildQueryFromOptions(query, options, ds);

      expect(spy.calledOnce).equal(true);
      expect(options.filters[0][2]).to.equal(spy);
    });

    test('and throw error if wrong format for filters', () => {
      const options = {
        filters: 'name',
      };
      const fn = (): void => {
        // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
        // @ts-ignore
        query = queryHelpers.buildQueryFromOptions(query, options, ds);
      };

      expect(fn).to.throw(Error);
    });

    test('and add start cursor', () => {
      const options = {
        start: 'abcdef',
      };

      query = queryHelpers.buildQueryFromOptions(query, options, ds);

      expect(query.startVal).equal(options.start);
    });
  });
});
