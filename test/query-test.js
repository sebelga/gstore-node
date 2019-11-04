'use strict';

const chai = require('chai');
const sinon = require('sinon');

const { Gstore, QUERIES_FORMATS } = require('../');
const ds = require('./mocks/datastore')({
  namespace: 'com.mydomain',
});
const Transaction = require('./mocks/transaction');
const Query = require('./mocks/query');
const { generateEntities } = require('./mocks/entities');

const gstore = new Gstore();
const gstoreWithCache = new Gstore({ cache: true });
const { Schema } = gstore;
const { expect, assert } = chai;

let query;
let mockEntities;
let responseQueries;
let ModelInstance;

const setupCacheContext = () => {
  gstore.cache = gstoreWithCache.cache;

  query = ModelInstance.query().filter('name', '=', 'John');

  responseQueries = [
    mockEntities,
    {
      moreResults: ds.MORE_RESULTS_AFTER_LIMIT,
      endCursor: 'abcdef',
    },
  ];

  sinon.spy(gstore.cache.queries, 'read');
};

const cleanupCacheContext = () => {
  gstore.cache.reset();
  gstore.cache.queries.read.restore();
  delete gstore.cache;
};

describe('Query', () => {
  let schema;
  let transaction;

  beforeEach(() => {
    gstore.models = {};
    gstore.modelSchemas = {};
    gstore.options = {};
    gstore.cache = undefined;

    gstore.connect(ds);
    gstoreWithCache.connect(ds);

    schema = new Schema({
      name: { type: 'string' },
      lastname: { type: 'string', excludeFromIndexes: true },
      password: { read: false },
      age: { type: 'int', excludeFromIndexes: true },
      birthday: { type: 'datetime' },
      street: {},
      website: { validate: 'isURL' },
      email: { validate: 'isEmail' },
      ip: { validate: { rule: 'isIP', args: [4] } },
      ip2: { validate: { rule: 'isIP' } }, // no args passed
      modified: { type: 'boolean' },
      tags: { type: 'array' },
      prefs: { type: 'object' },
      price: { type: 'double', write: false },
      icon: { type: 'buffer' },
      location: { type: 'geoPoint' },
    });

    ModelInstance = gstore.model('BlogTestQuery', schema);
    transaction = new Transaction();

    ({ mockEntities } = generateEntities());
  });

  afterEach(() => {
    if (query && query.__originalRun && query.__originalRun.restore) {
      query.__originalRun.restore();
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
      const fn = () => {
        query = ModelInstance.query()
          .filter('name', '=', 'John')
          .groupBy(['name'])
          .select(['name'])
          .order('lastname', { descending: true })
          .limit(1)
          .offset(1)
          .start('X');
        return query;
      };

      expect(fn).to.not.throw(Error);
    });

    test('should throw error if calling unregistered query method', () => {
      const fn = () => {
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

        expect(query.__originalRun.called).equal(true);
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
        assert(query.__originalRun.called);
        const { args } = query.__originalRun.getCall(0);
        expect(args[0].consistency).equal('strong');
      }));

    test('should not add endCursor to response', () => {
      query.__originalRun.restore();
      sinon.stub(query, '__originalRun').resolves([[], { moreResults: ds.NO_MORE_RESULTS }]);

      return query.run().then(response => {
        assert.isUndefined(response.nextPageCursor);
      });
    });

    test('should catch error thrown in query run()', () => {
      const error = { code: 400, message: 'Something went wrong doctor' };
      query.__originalRun.restore();
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
      query = ModelInstance.query(null, transaction);
      expect(query.scope.constructor.name).equal('Transaction');
    });

    test('should not set transaction if not an instance of gcloud Transaction', () => {
      const fn = () => {
        query = ModelInstance.query(null, {});
      };

      expect(fn).to.throw(Error);
    });

    test('should still work with a callback', () => {
      query = ModelInstance.query().filter('name', 'John');
      sinon.stub(query, '__originalRun').resolves(responseQueries);

      return query.run((err, response) => {
        expect(query.__originalRun.called).equal(true);
        expect(response.entities.length).equal(2);
        expect(response.nextPageCursor).equal('abcdef');
      });
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
          assert.ok(query.__originalRun.called);
          expect(gstore.cache.queries.read.callCount).equal(1);
          expect(gstore.cache.queries.read.getCall(0).args[1].ttl).equal(9999);
          expect(response.entities[0].name).deep.equal(mockEntities[0].name);
          expect(response.entities[1].name).deep.equal(mockEntities[1].name);
        }));

      test('should *not* get query from cache', () =>
        gstore.cache.queries.set(query, responseQueries, { ttl: 600 }).then(() =>
          query.run({ cache: false }).then(() => {
            assert.ok(query.__originalRun.called);
          }),
        ));

      test('should *not* get query from cache when ttl === -1', () => {
        const conf = { ...gstore.cache.config.ttl };
        gstore.cache.config.ttl.queries = -1;

        return gstore.cache.queries.set(query, responseQueries, { ttl: 600 }).then(() =>
          query.run().then(() => {
            expect(gstore.cache.queries.read.callCount).equal(0);
            assert.ok(query.__originalRun.called);
            gstore.cache.config.ttl = conf; // put back original config
          }),
        );
      });

      test('should get query from the cache when ttl === -1 but option.cache is set to "true"', () => {
        const conf = { ...gstore.cache.config.ttl };
        gstore.cache.config.ttl.queries = -1;

        return gstore.cache.queries.set(query, responseQueries, { ttl: 600 }).then(() =>
          query.run({ cache: true }).then(() => {
            expect(gstore.cache.queries.read.callCount).equal(1);
            assert.ok(!query.__originalRun.called);
            gstore.cache.config.ttl = conf; // put back original config
          }),
        );
      });
    });
  });

  describe('shortcut queries', () => {
    let queryMock;

    beforeEach(() => {
      sinon.stub(ds, 'createQuery').callsFake(namespace => {
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
      if (queryMock.run.restore) {
        queryMock.run.restore();
      }
      if (queryMock.filter.restore) {
        queryMock.filter.restore();
      }
      if (queryMock.hasAncestor.restore) {
        queryMock.hasAncestor.restore();
      }
      if (queryMock.order.restore) {
        queryMock.order.restore();
      }
      if (queryMock.limit.restore) {
        queryMock.limit.restore();
      }
      if (queryMock.offset.restore) {
        queryMock.offset.restore();
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
          expect(queryMock.limit.getCall(0).args[0]).equal(querySettings.limit);
          expect(queryMock.offset.getCall(0).args[0]).equal(querySettings.offset);
          expect(response.entities[0].__className).equal('Entity');
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
          expect(queryMock.limit.getCall(0).args[0]).equal(15);
          expect(queryMock.offset.getCall(0).args[0]).equal(15);
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
            expect(ModelInstance.gstore.cache.queries.read.callCount).equal(1);
            expect(ModelInstance.gstore.cache.queries.read.getCall(0).args[1]).contains(options);
          });
        });

        test('should *not* get query from cache', () =>
          ModelInstance.list({ cache: false }).then(() => {
            expect(ModelInstance.gstore.cache.queries.read.callCount).equal(0);
          }));
      });
    });

    describe('findAround()', () => {
      test('should get 3 entities after a given date', () =>
        ModelInstance.findAround('createdOn', '2016-1-1', { after: 3 }).then(entities => {
          expect(queryMock.filter.getCall(0).args).deep.equal(['createdOn', '>', '2016-1-1']);
          expect(queryMock.order.getCall(0).args).deep.equal(['createdOn', { descending: true }]);
          expect(queryMock.limit.getCall(0).args[0]).equal(3);

          // Make sure to not show properties where read is set to false
          assert.isUndefined(entities[0].password);
        }));

      test('should get 3 entities before a given date', () =>
        ModelInstance.findAround('createdOn', '2016-1-1', { before: 12 }).then(() => {
          expect(queryMock.filter.getCall(0).args).deep.equal(['createdOn', '<', '2016-1-1']);
          expect(queryMock.limit.getCall(0).args[0]).equal(12);
        }));

      test('should throw error if not all arguments are passed', done => {
        ModelInstance.findAround('createdOn', '2016-1-1').catch(err => {
          expect(err.message).equal('[gstore.findAround()]: Not all the arguments were provided.');
          done();
        });
      });

      test('should validate that options passed is an object', done => {
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
            expect(entities[0].__className).equal('Entity');
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
            expect(ModelInstance.gstore.cache.queries.read.callCount).equal(1);
            const { args } = ModelInstance.gstore.cache.queries.read.getCall(0);
            expect(args[1]).contains({ ttl: 7777, cache: true });
          });
        });

        test('should *not* get query from cache', () =>
          ModelInstance.findAround('xxx', 'xxx', { after: 3, cache: false }).then(() => {
            expect(ModelInstance.gstore.cache.queries.read.callCount).equal(0);
          }));
      });
    });

    describe('findOne()', () => {
      test('should call pre and post hooks', () => {
        const spies = {
          pre: () => Promise.resolve(),
          post: () => Promise.resolve(),
        };
        sinon.spy(spies, 'pre');
        sinon.spy(spies, 'post');
        schema.pre('findOne', spies.pre);
        schema.post('findOne', spies.post);
        ModelInstance = gstore.model('Blog', schema);

        return ModelInstance.findOne({}).then(() => {
          expect(spies.pre.calledOnce).equal(true);
          expect(spies.post.calledOnce).equal(true);
          expect(spies.pre.calledBefore(queryMock.__originalRun)).equal(true);
          expect(spies.post.calledAfter(queryMock.__originalRun)).equal(true);
        });
      });

      test('should run correct gcloud Query', () =>
        ModelInstance.findOne({ name: 'John', email: 'john@snow.com' }).then(() => {
          expect(queryMock.filter.getCall(0).args).deep.equal(['name', 'John']);

          expect(queryMock.filter.getCall(1).args).deep.equal(['email', 'john@snow.com']);
        }));

      test('should return a Model instance', () =>
        ModelInstance.findOne({ name: 'John' }).then(entity => {
          expect(entity.entityKind).equal('BlogTestQuery');
          expect(entity.__className).equal('Entity');
        }));

      test('should validate that params passed are object', done => {
        ModelInstance.findOne('some string').catch(err => {
          expect(err.message).equal('[gstore.findOne()]: "Params" has to be an object.');
          done();
        });
      });

      test('should accept ancestors', () => {
        const ancestors = ['Parent', 'keyname'];

        return ModelInstance.findOne({ name: 'John' }, ancestors, () => {
          expect(queryMock.hasAncestor.getCall(0).args[0].path).deep.equal(ancestors);
        });
      });

      test('should accept a namespace', () => {
        const namespace = 'com.new-domain.dev';

        return ModelInstance.findOne({ name: 'John' }, null, namespace).then(() => {
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
        const spyPre = sinon.stub().callsFake((...args) => {
          // Make sure the original arguments are passed to the hook
          if (args[0].name === 'John') {
            // And override them
            return Promise.resolve({
              __override: [{ name: 'Mick', email: 'mick@jagger.com' }, ['Parent', 'default']],
            });
          }
          return Promise.resolve();
        });

        schema = new Schema({ name: { type: 'string' } });
        schema.pre('findOne', function preHook(...args) {
          return spyPre.apply(this, args);
        });

        ModelInstance = gstore.model('Blog', schema);

        return ModelInstance.findOne({ name: 'John', email: 'john@snow.com' }).then(() => {
          assert.ok(spyPre.calledBefore(ds.createQuery));
          const { args } = queryMock.filter.getCall(0);
          const { args: args2 } = queryMock.filter.getCall(1);
          const { args: args3 } = queryMock.hasAncestor.getCall(0);

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
          ModelInstance.findOne({ name: 'John' }, null, null, { ttl: 7777, cache: true }).then(() => {
            expect(ModelInstance.gstore.cache.queries.read.callCount).equal(1);
            const { args } = ModelInstance.gstore.cache.queries.read.getCall(0);
            expect(args[1]).contains({ ttl: 7777, cache: true });
          }));

        test('should *not* get query from cache', () =>
          ModelInstance.findOne({ name: 'John' }, null, null, { cache: false }).then(() => {
            expect(ModelInstance.gstore.cache.queries.read.callCount).equal(0);
          }));
      });
    });
  });
});
