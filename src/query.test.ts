import chai from 'chai';
import sinon from 'sinon';
import { Transaction as DatastoreTransaction } from '@google-cloud/datastore';

import { Gstore, QUERIES_FORMATS } from './index';
import Model from './model';
import GstoreEntity from './entity';
import GstoreSchema from './schema';

import dsFactory from '../__tests__/mocks/datastore';
import Transaction from '../__tests__/mocks/transaction';
import Query from '../__tests__/mocks/query';
import entitiesMock from '../__tests__/mocks/entities';
import { GstoreQuery } from './query';

const ds = dsFactory({
  namespace: 'com.mydomain',
});

const gstore = new Gstore();
const gstoreWithCache = new Gstore({ cache: true });
const { Schema } = gstore;
const { expect, assert } = chai;
const { generateEntities } = entitiesMock;

let query: GstoreQuery<any, any>;
let mockEntities: any;
let responseQueries: any;
let ModelInstance: Model;

const setupCacheContext = (): void => {
  gstore.cache = gstoreWithCache.cache;

  query = ModelInstance.query().filter('name', '=', 'John') as any;

  responseQueries = [
    mockEntities,
    {
      moreResults: ds.MORE_RESULTS_AFTER_LIMIT,
      endCursor: 'abcdef',
    },
  ];

  sinon.spy(gstore.cache!.queries, 'read');
};

const cleanupCacheContext = (): void => {
  gstore.cache!.reset();
  (gstore.cache!.queries.read as any).restore();
  delete gstore.cache;
};

describe('Query', () => {
  let schema: GstoreSchema;
  let transaction: DatastoreTransaction;

  beforeEach(() => {
    gstore.models = {};
    gstore.cache = undefined;

    gstore.connect(ds);
    gstoreWithCache.connect(ds);

    schema = new Schema({
      name: { type: String },
      lastname: { type: String, excludeFromIndexes: true },
      password: { read: false },
      age: { type: Number, excludeFromIndexes: true },
      birthday: { type: Date },
      street: {},
      website: { validate: 'isURL' },
      email: { validate: 'isEmail' },
      ip: { validate: { rule: 'isIP', args: [4] } },
      ip2: { validate: { rule: 'isIP' } }, // no args passed
      modified: { type: Boolean },
      tags: { type: Array },
      prefs: { type: Object },
      price: { type: Schema.Types.Double, write: false },
      icon: { type: Buffer },
      location: { type: 'geoPoint' },
    });

    ModelInstance = gstore.model('BlogTestQuery', schema);
    transaction = new Transaction();

    ({ mockEntities } = generateEntities());
  });

  afterEach(() => {
    if (query && query.__originalRun && (query.__originalRun as any).restore) {
      (query.__originalRun as any).restore();
    }
  });

  describe('gcloud-node queries', () => {
    beforeEach(() => {
      responseQueries = [
        mockEntities,
        {
          moreResults: ds.MORE_RESULTS_AFTER_LIMIT,
          endCursor: 'abcdef',
        },
      ];

      query = ModelInstance.query();
      sinon.stub(query, '__originalRun').resolves(responseQueries);
    });

    test('should create gcloud-node Query object', () => {
      query = ModelInstance.query();

      expect(query.constructor.name).equal('Query');
    });

    test('should be able to execute all gcloud-node queries', () => {
      const fn = (): GstoreQuery<any, any> => {
        query = ModelInstance.query()
          .filter('name', '=', 'John')
          .groupBy(['name'])
          .select(['name'])
          .order('lastname', { descending: true })
          .limit(1)
          .offset(1)
          .start('X') as any;
        return query;
      };

      expect(fn).to.not.throw(Error);
    });

    test('should throw error if calling unregistered query method', () => {
      const fn = (): GstoreQuery<any, any> => {
        // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
        // @ts-ignore
        query = ModelInstance.query().unkown('test', false);
        return query;
      };

      expect(fn).to.throw(Error);
    });

    test('should run query', () =>
      query.run().then(response => {
        // We add manually the id in the mocks to be able to deep compare
        mockEntities[0].id = 1234;
        mockEntities[1].id = 'keyname';

        // we delete from the mock the property
        // 'password' it has been defined with read: false
        delete mockEntities[0].password;

        expect((query.__originalRun as any).called).equal(true);
        expect(response.entities.length).equal(2);
        assert.isUndefined(response.entities[0].password);
        expect(response.entities).deep.equal(mockEntities);
        expect(response.nextPageCursor).equal('abcdef');

        delete mockEntities[0].id;
        delete mockEntities[1].id;
      }));

    test('should add id to entities', () =>
      query.run().then(response => {
        expect(response.entities[0].id).equal(mockEntities[0][ds.KEY].id);
        expect(response.entities[1].id).equal(mockEntities[1][ds.KEY].name);
      }));

    test('should accept "readAll" option', () =>
      query.run({ readAll: true }).then(response => {
        assert.isDefined(response.entities[0].password);
      }));

    test('should accept "showKey" option', () =>
      query.run({ showKey: true }).then(response => {
        assert.isDefined(response.entities[0].__key);
      }));

    test('should forward options to underlying Datastore.Query', () =>
      query.run({ consistency: 'strong' }).then(() => {
        assert((query.__originalRun as any).called);
        const { args } = (query.__originalRun as any).getCall(0);
        expect(args[0].consistency).equal('strong');
      }));

    test('should not add endCursor to response', () => {
      (query.__originalRun as any).restore();
      sinon.stub(query, '__originalRun').resolves([[], { moreResults: ds.NO_MORE_RESULTS }]);

      return query.run().then(response => {
        assert.isUndefined(response.nextPageCursor);
      });
    });

    test('should catch error thrown in query run()', () => {
      const error = { code: 400, message: 'Something went wrong doctor' };
      (query.__originalRun as any).restore();
      sinon.stub(query, '__originalRun').rejects(error);

      return query.run().catch(err => {
        expect(err).equal(error);
      });
    });

    test('should allow a namespace for query', () => {
      const namespace = 'com.mydomain-dev';
      query = ModelInstance.query(namespace);

      expect(query.namespace).equal(namespace);
    });

    test('should create query on existing transaction', () => {
      query = ModelInstance.query(undefined, transaction);
      expect(query.scope!.constructor.name).equal('Transaction');
    });

    test('should not set transaction if not an instance of gcloud Transaction', () => {
      const fn = (): void => {
        // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
        // @ts-ignore
        query = ModelInstance.query(undefined, {});
      };

      expect(fn).to.throw(Error);
    });

    describe('when cache is active', () => {
      beforeEach(() => {
        setupCacheContext();
        sinon.stub(query, '__originalRun').resolves(responseQueries);
      });

      afterEach(() => {
        cleanupCacheContext();
      });

      test('should get query from cache and pass down options', () =>
        query.run({ ttl: 9999 }).then(response => {
          assert.ok((query.__originalRun as any).called);
          expect((gstore.cache!.queries.read as any).callCount).equal(1);
          expect((gstore.cache!.queries.read as any).getCall(0).args[1].ttl).equal(9999);
          expect(response.entities[0].name).deep.equal(mockEntities[0].name);
          expect(response.entities[1].name).deep.equal(mockEntities[1].name);
        }));

      test('should *not* get query from cache', () =>
        gstore.cache!.queries.set(query as any, responseQueries, { ttl: 600 }).then(() =>
          query.run({ cache: false }).then(() => {
            assert.ok((query.__originalRun as any).called);
          }),
        ));

      test('should *not* get query from cache when ttl === -1', () => {
        const conf = { ...gstore.cache!.config.ttl };
        gstore.cache!.config.ttl.queries = -1;

        return gstore.cache!.queries.set(query as any, responseQueries, { ttl: 600 }).then(() =>
          query.run().then(() => {
            expect((gstore.cache!.queries.read as any).callCount).equal(0);
            assert.ok((query.__originalRun as any).called);
            gstore.cache!.config.ttl = conf; // put back original config
          }),
        );
      });

      test('should get query from the cache when ttl === -1 but option.cache is set to "true"', () => {
        const conf = { ...gstore.cache!.config.ttl };
        gstore.cache!.config.ttl.queries = -1;

        return gstore.cache!.queries.set(query as any, responseQueries, { ttl: 600 }).then(() =>
          query.run({ cache: true }).then(() => {
            expect((gstore.cache!.queries.read as any).callCount).equal(1);
            assert.ok(!(query.__originalRun as any).called);
            gstore.cache!.config.ttl = conf; // put back original config
          }),
        );
      });
    });
  });

  describe('shortcut queries', () => {
    let queryMock: Query;

    beforeEach(() => {
      sinon.stub(ds, 'createQuery').callsFake((namespace: string) => {
        queryMock = new Query(ds, { entities: mockEntities }, undefined, namespace);

        sinon.spy(queryMock, 'run');
        sinon.spy(queryMock, 'filter');
        sinon.spy(queryMock, 'hasAncestor');
        sinon.spy(queryMock, 'order');
        sinon.spy(queryMock, 'limit');
        sinon.spy(queryMock, 'offset');

        return queryMock;
      });
    });

    afterEach(() => {
      ds.createQuery.restore();
      if (!queryMock) {
        return;
      }
      if ((queryMock.run as any).restore) {
        (queryMock.run as any).restore();
      }
      if ((queryMock.filter as any).restore) {
        (queryMock.filter as any).restore();
      }
      if ((queryMock.hasAncestor as any).restore) {
        (queryMock.hasAncestor as any).restore();
      }
      if ((queryMock.order as any).restore) {
        (queryMock.order as any).restore();
      }
      if ((queryMock.limit as any).restore) {
        (queryMock.limit as any).restore();
      }
      if ((queryMock.offset as any).restore) {
        (queryMock.offset as any).restore();
      }
    });

    describe('list', () => {
      test('should work with no settings defined', () =>
        ModelInstance.list().then(response => {
          expect(response.entities.length).equal(2);
          expect(response.nextPageCursor).equal('abcdef');
          assert.isUndefined(response.entities[0].password);
        }));

      test('should add id to entities', () =>
        ModelInstance.list().then(response => {
          expect(response.entities[0].id).equal(mockEntities[0][ds.KEY].id);
          expect(response.entities[1].id).equal(mockEntities[1][ds.KEY].name);
        }));

      test('should not add endCursor to response', () => {
        ds.createQuery.restore();
        sinon
          .stub(ds, 'createQuery')
          .callsFake(() => new Query(ds, { entities: mockEntities }, { moreResults: ds.NO_MORE_RESULTS }));

        return ModelInstance.list().then(response => {
          assert.isUndefined(response.nextPageCursor);
        });
      });

      test('should read settings passed', () => {
        const querySettings = {
          limit: 10,
          offset: 10,
          format: QUERIES_FORMATS.ENTITY,
        };
        schema.queries('list', querySettings);
        ModelInstance = gstore.model('Blog', schema);

        return ModelInstance.list().then(response => {
          expect((queryMock.limit as any).getCall(0).args[0]).equal(querySettings.limit);
          expect((queryMock.offset as any).getCall(0).args[0]).equal(querySettings.offset);
          expect(response.entities[0] instanceof GstoreEntity).equal(true);
        });
      });

      test('should override global setting with options', () => {
        const querySettings = {
          limit: 10,
          offset: 10,
          readAll: true,
          showKey: true,
        };
        schema.queries('list', querySettings);
        ModelInstance = gstore.model('Blog', schema);

        return ModelInstance.list({ limit: 15, offset: 15 }).then(response => {
          expect((queryMock.limit as any).getCall(0).args[0]).equal(15);
          expect((queryMock.offset as any).getCall(0).args[0]).equal(15);
          assert.isDefined(response.entities[0].password);
          assert.isDefined(response.entities[0].__key);
        });
      });

      test('should deal with err response', () => {
        const error = { code: 500, message: 'Server error' };
        ds.createQuery.callsFake(() => {
          queryMock = new Query(ds, { entities: mockEntities });
          sinon.stub(queryMock, 'run').rejects(error);
          return queryMock;
        });

        return ModelInstance.list().catch(err => {
          expect(err).equal(err);
        });
      });

      test('should accept a namespace ', () => {
        const namespace = 'com.mydomain-dev';

        return ModelInstance.list({ namespace }).then(() => {
          expect(queryMock.namespace).equal(namespace);
        });
      });

      describe('when cache is active', () => {
        beforeEach(() => {
          setupCacheContext();
        });

        afterEach(() => {
          cleanupCacheContext();
        });

        test('should get query from cache and pass down options', () => {
          const options = { ttl: 7777, cache: true };

          return ModelInstance.list(options).then(() => {
            expect((ModelInstance.gstore.cache!.queries.read as any).callCount).equal(1);
            expect((ModelInstance.gstore.cache!.queries.read as any).getCall(0).args[1]).contains(options);
          });
        });

        test('should *not* get query from cache', () =>
          ModelInstance.list({ cache: false }).then(() => {
            expect((ModelInstance.gstore.cache!.queries.read as any).callCount).equal(0);
          }));
      });
    });

    describe('findAround()', () => {
      test('should get 3 entities after a given date', () =>
        ModelInstance.findAround('createdOn', '2016-1-1', { after: 3 }).then(entities => {
          expect((queryMock.filter as any).getCall(0).args).deep.equal(['createdOn', '>', '2016-1-1']);
          expect((queryMock.order as any).getCall(0).args).deep.equal(['createdOn', { descending: true }]);
          expect((queryMock.limit as any).getCall(0).args[0]).equal(3);

          // Make sure to not show properties where read is set to false
          assert.isUndefined(entities[0].password);
        }));

      test('should get 3 entities before a given date', () =>
        ModelInstance.findAround('createdOn', '2016-1-1', { before: 12 }).then(() => {
          expect((queryMock.filter as any).getCall(0).args).deep.equal(['createdOn', '<', '2016-1-1']);
          expect((queryMock.limit as any).getCall(0).args[0]).equal(12);
        }));

      test('should throw error if not all arguments are passed', done => {
        // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
        // @ts-ignore
        ModelInstance.findAround('createdOn', '2016-1-1').catch(err => {
          expect(err.message).equal('[gstore.findAround()]: Not all the arguments were provided.');
          done();
        });
      });

      test('should validate that options passed is an object', done => {
        // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
        // @ts-ignore
        ModelInstance.findAround('createdOn', '2016-1-1', 'string').catch(err => {
          expect(err.message).equal('[gstore.findAround()]: Options pased has to be an object.');
          done();
        });
      });

      test('should validate that options has an "after" or "before" property', done => {
        ModelInstance.findAround('createdOn', '2016-1-1', {}).catch(err => {
          expect(err.message).equal('[gstore.findAround()]: You must set "after" or "before" in options.');
          done();
        });
      });

      test('should validate that options has not both "after" & "before" properties', done => {
        ModelInstance.findAround('createdOn', '2016-1-1', { after: 3, before: 3 }).catch(err => {
          expect(err.message).equal('[gstore.findAround()]: You can\'t set both "after" and "before".');
          done();
        });
      });

      test('should add id to entities', () =>
        ModelInstance.findAround('createdOn', '2016-1-1', { before: 3 }).then(entities => {
          expect(entities[0].id).equal(mockEntities[0][ds.KEY].id);
          expect(entities[1].id).equal(mockEntities[1][ds.KEY].name);
        }));

      test('should read all properties', () =>
        ModelInstance.findAround('createdOn', '2016-1-1', { before: 3, readAll: true, format: 'ENTITY' }).then(
          entities => {
            assert.isDefined(entities[0].password);
            expect(entities[0] instanceof GstoreEntity).equal(true);
          },
        ));

      test('should add entities key', () =>
        ModelInstance.findAround('createdOn', '2016-1-1', { before: 3, showKey: true }).then(entities => {
          assert.isDefined(entities[0].__key);
        }));

      test('should accept a namespace', () => {
        const namespace = 'com.new-domain.dev';
        ModelInstance.findAround('createdOn', '2016-1-1', { before: 3 }, namespace).then(() => {
          expect(ds.createQuery.getCall(0).args[0]).equal(namespace);
        });
      });

      test('should deal with err response', () => {
        const error = { code: 500, message: 'Server error' };

        ds.createQuery.callsFake(() => {
          queryMock = new Query(ds, { entities: mockEntities });
          sinon.stub(queryMock, 'run').rejects(error);
          return queryMock;
        });

        return ModelInstance.findAround('createdOn', '2016-1-1', { after: 3 }).catch(err => {
          expect(err).equal(error);
        });
      });

      describe('when cache is active', () => {
        beforeEach(() => {
          setupCacheContext();
        });

        afterEach(() => {
          cleanupCacheContext();
        });

        test('should get query from cache and pass down options', () => {
          const options = { ttl: 7777, cache: true, after: 3 };

          return ModelInstance.findAround('xxx', 'xxx', options).then(() => {
            expect((ModelInstance.gstore.cache!.queries.read as any).callCount).equal(1);
            const { args } = (ModelInstance.gstore.cache!.queries.read as any).getCall(0);
            expect(args[1]).contains({ ttl: 7777, cache: true });
          });
        });

        test('should *not* get query from cache', () =>
          ModelInstance.findAround('xxx', 'xxx', { after: 3, cache: false }).then(() => {
            expect((ModelInstance.gstore.cache!.queries.read as any).callCount).equal(0);
          }));
      });
    });

    describe('findOne()', () => {
      test('should call pre and post hooks', () => {
        const spies = {
          pre: (): Promise<void> => Promise.resolve(),
          post: (): Promise<void> => Promise.resolve(),
        };
        sinon.spy(spies, 'pre');
        sinon.spy(spies, 'post');
        schema.pre('findOne', spies.pre);
        schema.post('findOne', spies.post);
        ModelInstance = gstore.model('Blog', schema);

        return ModelInstance.findOne({}).then(() => {
          expect((spies.pre as any).calledOnce).equal(true);
          expect((spies.post as any).calledOnce).equal(true);
          expect((spies.pre as any).calledBefore((queryMock as any).__originalRun)).equal(true);
          expect((spies.post as any).calledAfter((queryMock as any).__originalRun)).equal(true);
        });
      });

      test('should run correct gcloud Query', () =>
        ModelInstance.findOne({ name: 'John', email: 'john@snow.com' }).then(() => {
          expect((queryMock.filter as any).getCall(0).args).deep.equal(['name', 'John']);

          expect((queryMock.filter as any).getCall(1).args).deep.equal(['email', 'john@snow.com']);
        }));

      test('should return a Model instance', () =>
        ModelInstance.findOne({ name: 'John' }).then(entity => {
          expect(entity!.entityKind).equal('BlogTestQuery');
          expect(entity instanceof GstoreEntity).equal(true);
        }));

      test('should validate that params passed are object', done => {
        // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
        // @ts-ignore
        ModelInstance.findOne('some string').catch(err => {
          expect(err.message).equal('[gstore.findOne()]: "Params" has to be an object.');
          done();
        });
      });

      test('should accept ancestors', () => {
        const ancestors = ['Parent', 'keyname'];

        return ModelInstance.findOne({ name: 'John' }, ancestors).then(() => {
          expect((queryMock.hasAncestor as any).getCall(0).args[0].path).deep.equal(ancestors);
        });
      });

      test('should accept a namespace', () => {
        const namespace = 'com.new-domain.dev';

        return ModelInstance.findOne({ name: 'John' }, undefined, namespace).then(() => {
          expect(ds.createQuery.getCall(0).args[0]).equal(namespace);
        });
      });

      test('should deal with err response', () => {
        const error = { code: 500, message: 'Server error' };

        ds.createQuery.callsFake(() => {
          queryMock = new Query(ds, { entities: mockEntities });
          sinon.stub(queryMock, 'run').rejects(error);
          return queryMock;
        });

        return ModelInstance.findOne({ name: 'John' }).catch(err => {
          expect(err).equal(error);
        });
      });

      test('if entity not found should return "ERR_ENTITY_NOT_FOUND"', () => {
        ds.createQuery.callsFake(() => {
          queryMock = new Query(ds, { entities: [] });
          return queryMock;
        });

        return ModelInstance.findOne({ name: 'John' }).catch(err => {
          expect(err.code).equal(gstore.errors.codes.ERR_ENTITY_NOT_FOUND);
        });
      });

      test('should call pre hooks and override parameters', () => {
        const spyPre = sinon.stub().callsFake((...args: any[]) => {
          // Make sure the original arguments are passed to the hook
          if (args[0].name === 'John') {
            // And override them
            return Promise.resolve({
              __override: [{ name: 'Mick', email: 'mick@jagger.com' }, ['Parent', 'default']],
            });
          }
          return Promise.resolve();
        });

        schema = new Schema({ name: { type: String } });
        schema.pre('findOne', function preHook(this: any, ...args) {
          return spyPre.apply(this, args);
        });

        ModelInstance = gstore.model('Blog', schema);

        return ModelInstance.findOne({ name: 'John', email: 'john@snow.com' }).then(() => {
          assert.ok(spyPre.calledBefore(ds.createQuery));
          const { args } = (queryMock.filter as any).getCall(0);
          const { args: args2 } = (queryMock.filter as any).getCall(1);
          const { args: args3 } = (queryMock.hasAncestor as any).getCall(0);

          expect(args[0]).equal('name');
          expect(args[1]).equal('Mick');
          expect(args2[0]).equal('email');
          expect(args2[1]).equal('mick@jagger.com');
          expect(args3[0].kind).equal('Parent');
          expect(args3[0].name).equal('default');
        });
      });

      describe('when cache is active', () => {
        beforeEach(() => {
          setupCacheContext();
        });

        afterEach(() => {
          cleanupCacheContext();
        });

        test('should get query from cache and pass down options', () =>
          ModelInstance.findOne({ name: 'John' }, undefined, undefined, { ttl: 7777, cache: true }).then(() => {
            expect((ModelInstance.gstore.cache!.queries.read as any).callCount).equal(1);
            const { args } = (ModelInstance.gstore.cache!.queries.read as any).getCall(0);
            expect(args[1]).contains({ ttl: 7777, cache: true });
          }));

        test('should *not* get query from cache', () =>
          ModelInstance.findOne({ name: 'John' }, undefined, undefined, { cache: false }).then(() => {
            expect((ModelInstance.gstore.cache!.queries.read as any).callCount).equal(0);
          }));
      });
    });
  });
});
