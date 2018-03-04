'use strict';

const chai = require('chai');
const sinon = require('sinon');
const is = require('is');

const gstore = require('../')();
const gstoreWithCache = require('../')({ namespace: 'model-with-cache', cache: true });
const ds = require('./mocks/datastore')({
    namespace: 'com.mydomain',
});
const Transaction = require('./mocks/transaction');
const Query = require('./mocks/query');
const { generateEntities } = require('./mocks/entities');
const { queryHelpers } = require('../lib/helpers');
const Model = require('../lib/model');

const { Schema } = gstore;
const { expect, assert } = chai;

describe('Query', () => {
    let schema;
    let ModelInstance;
    let transaction;
    let mockEntities;

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

        ModelInstance = gstore.model('Blog', schema, gstore);
        transaction = new Transaction();

        ({ mockEntities } = generateEntities());
    });

    describe('gcloud-node queries', () => {
        let query;
        let responseQueries;

        beforeEach(() => {
            responseQueries = [mockEntities, {
                moreResults: ds.MORE_RESULTS_AFTER_LIMIT,
                endCursor: 'abcdef',
            }];

            query = ModelInstance.query();
            sinon.stub(query, '__originalRun').resolves(responseQueries);
        });

        it('should create gcloud-node Query object', () => {
            query = ModelInstance.query();

            expect(query.constructor.name).equal('Query');
        });

        it('should be able to execute all gcloud-node queries', () => {
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

        it('should throw error if calling unregistered query method', () => {
            const fn = () => {
                query = ModelInstance.query()
                    .unkown('test', false);
                return query;
            };

            expect(fn).to.throw(Error);
        });

        it('should run query', () => query.run().then((response) => {
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

        it('should add id to entities', () => (
            query.run()
                .then((response) => {
                    expect(response.entities[0].id).equal(mockEntities[0][ds.KEY].id);
                    expect(response.entities[1].id).equal(mockEntities[1][ds.KEY].name);
                })
        ));

        it('should accept "readAll" option', () => (
            query.run(({ readAll: true }))
                .then((response) => {
                    assert.isDefined(response.entities[0].password);
                })
        ));

        it('should accept "showKey" option', () => (
            query.run(({ showKey: true }))
                .then((response) => {
                    assert.isDefined(response.entities[0].__key);
                })
        ));

        it('should not add endCursor to response', () => {
            query.__originalRun.restore();
            sinon.stub(query, '__originalRun').resolves([[], { moreResults: ds.NO_MORE_RESULTS }]);

            return query.run().then((response) => {
                assert.isUndefined(response.nextPageCursor);
            });
        });

        it('should catch error thrown in query run()', () => {
            const error = { code: 400, message: 'Something went wrong doctor' };
            query.__originalRun.restore();
            sinon.stub(query, '__originalRun').rejects(error);

            return query.run().catch((err) => {
                expect(err).equal(error);
            });
        });

        it('should allow a namespace for query', () => {
            const namespace = 'com.mydomain-dev';
            query = ModelInstance.query(namespace);

            expect(query.namespace).equal(namespace);
        });

        it('should create query on existing transaction', () => {
            query = ModelInstance.query(null, transaction);
            expect(query.scope.constructor.name).equal('Transaction');
        });

        it('should not set transaction if not an instance of gcloud Transaction', () => {
            const fn = () => {
                query = ModelInstance.query(null, {});
            };

            expect(fn).to.throw(Error);
        });

        it('should still work with a callback', () => {
            query = ModelInstance.query()
                .filter('name', 'John');
            sinon.stub(query, '__originalRun').resolves(responseQueries);

            return query.run((err, response) => {
                expect(query.__originalRun.called).equal(true);
                expect(response.entities.length).equal(2);
                expect(response.nextPageCursor).equal('abcdef');
            });
        });

        describe('--> cache', () => {
            let resQuery;

            beforeEach(() => {
                gstore.cache = gstoreWithCache.cache;

                query = ModelInstance.query()
                    .filter('name', '=', 'John');
                resQuery = [mockEntities, {
                    moreResults: ds.MORE_RESULTS_AFTER_LIMIT,
                    endCursor: 'abcdef',
                }];

                sinon.stub(query, '__originalRun').resolves(responseQueries);
            });

            afterEach(() => {
                // empty the cache
                gstore.cache.reset();
                delete gstore.cache;
                query.__originalRun.restore();
            });

            it('should get query from cache', () => (
                gstore.cache.queries.set(query, resQuery, { ttl: 600 })
                    .then(() => (
                        query.run()
                            .then((response) => {
                                assert.ok(!query.__originalRun.called);
                                expect(response.entities[0].name).deep.equal(mockEntities[0].name);
                                expect(response.entities[1].name).deep.equal(mockEntities[1].name);
                            })
                    ))
            ));

            it('should *not* get query from cache', () => (
                gstore.cache.queries.set(query, resQuery, { ttl: 600 })
                    .then(() => (
                        query.run({ cache: false })
                            .then(() => {
                                assert.ok(query.__originalRun.called);
                            })
                    ))
            ));

            it('should *not* get query from cache when ttl = -1', () => {
                // TODO: Make 2 tests
                // - one with ttl set to -1 in global
                // - one with ttl set to -1 in global + option cache set to "true"
            });

            // TODO: Test to pass custom ttl value for caching
        });
    });

    describe('shortcut queries', () => {
        let queryMock;
        beforeEach(() => {
            queryMock = new Query(ds, { entities: mockEntities });
            sinon.stub(ds, 'createQuery').callsFake(() => queryMock);
            sinon.spy(queryHelpers, 'buildFromOptions');
            sinon.spy(queryMock, 'run');
            sinon.spy(queryMock, 'filter');
            sinon.spy(queryMock, 'hasAncestor');
            sinon.spy(queryMock, 'order');
            sinon.spy(queryMock, 'limit');
            sinon.spy(queryMock, 'offset');
        });

        afterEach(() => {
            ds.createQuery.restore();
            queryHelpers.buildFromOptions.restore();
            if (queryMock.run.restore) {
                queryMock.run.restore();
            }
            queryMock.filter.restore();
            queryMock.hasAncestor.restore();
            queryMock.order.restore();
            queryMock.limit.restore();
            queryMock.offset.restore();
        });

        describe('list', () => {
            it('should work with no settings defined', () => (
                ModelInstance.list().then((response) => {
                    expect(response.entities.length).equal(2);
                    expect(response.nextPageCursor).equal('abcdef');
                    assert.isUndefined(response.entities[0].password);
                })
            ));

            it('should add id to entities', () => (
                ModelInstance.list().then((response) => {
                    expect(response.entities[0].id).equal(mockEntities[0][ds.KEY].id);
                    expect(response.entities[1].id).equal(mockEntities[1][ds.KEY].name);
                })
            ));

            it('should not add endCursor to response', () => {
                ds.createQuery.restore();
                sinon.stub(ds, 'createQuery').callsFake(() => (
                    new Query(ds, { entities: mockEntities }, { moreResults: ds.NO_MORE_RESULTS })));

                return ModelInstance.list().then((response) => {
                    assert.isUndefined(response.nextPageCursor);
                });
            });

            it('should read settings passed', () => {
                const querySettings = {
                    limit: 10,
                    offset: 10,
                    format: gstore.Queries.formats.ENTITY,
                };
                schema.queries('list', querySettings);
                ModelInstance = Model.compile('Blog', schema, gstore);

                return ModelInstance.list().then((response) => {
                    expect(queryHelpers.buildFromOptions.getCall(0).args[1].limit).equal(querySettings.limit);
                    expect(queryMock.limit.getCall(0).args[0]).equal(querySettings.limit);
                    expect(queryHelpers.buildFromOptions.getCall(0).args[1].offset).equal(querySettings.offset);
                    expect(queryMock.offset.getCall(0).args[0]).equal(querySettings.offset);
                    expect(response.entities[0].className).equal('Entity');
                });
            });

            it('should override global setting with options', () => {
                const querySettings = {
                    limit: 10,
                    offset: 10,
                    readAll: true,
                    showKey: true,
                };
                schema.queries('list', querySettings);
                ModelInstance = Model.compile('Blog', schema, gstore);

                return ModelInstance.list({ limit: 15, offset: 15 }).then((response) => {
                    expect(queryHelpers.buildFromOptions.getCall(0).args[1]).not.deep.equal(querySettings);
                    expect(queryMock.limit.getCall(0).args[0]).equal(15);
                    expect(queryMock.offset.getCall(0).args[0]).equal(15);
                    assert.isDefined(response.entities[0].password);
                    assert.isDefined(response.entities[0].__key);
                });
            });

            it('should deal with err response', () => {
                queryMock.run.restore();
                const error = { code: 500, message: 'Server error' };
                sinon.stub(queryMock, 'run').rejects(error);

                return ModelInstance.list().catch((err) => {
                    expect(err).equal(err);
                });
            });

            it('should accept a namespace ', () => {
                const namespace = 'com.mydomain-dev';

                return ModelInstance.list({ namespace }).then(() => {
                    expect(queryHelpers.buildFromOptions.getCall(0).args[1]).deep.equal({ namespace });
                });
            });

            it('should still work with a callback', () => ModelInstance.list((err, response) => {
                expect(response.entities.length).equal(2);
                expect(response.nextPageCursor).equal('abcdef');
                assert.isUndefined(response.entities[0].password);
            }));
        });

        describe('deleteAll()', () => {
            beforeEach(() => {
                sinon.stub(ds, 'delete').callsFake(() => {
                    // We need to update our mock response of the Query
                    // to not enter in an infinite loop as we recursivly query
                    // until there are no more entities
                    ds.createQuery.restore();
                    sinon.stub(ds, 'createQuery').callsFake(() => new Query(ds, { entities: [] }));
                    return Promise.resolve([{ indexUpdates: 3 }]);
                });

                sinon.spy(ModelInstance, 'query');
            });

            afterEach(() => {
                ds.delete.restore();
            });

            it('should get all entities through Query', () => ModelInstance.deleteAll().then(() => {
                // expect(queryMock.run.called).equal(true);
                // expect(ds.createQuery.getCall(0).args.length).equal(1);
                expect(ModelInstance.query.called).equal(true);
                expect(ModelInstance.query.getCall(0).args.length).equal(1);
            }));

            it('should catch error if could not fetch entities', () => {
                const error = { code: 500, message: 'Something went wrong' };
                queryMock.run.restore();
                sinon.stub(queryMock, 'run').rejects(error);

                return ModelInstance.deleteAll().catch((err) => {
                    expect(err).equal(error);
                });
            });

            it('if pre hooks, should call "delete" on all entities found (in series)', () => {
                schema = new Schema({});
                const spies = {
                    pre: () => Promise.resolve(),
                };
                sinon.spy(spies, 'pre');

                schema.pre('delete', spies.pre);

                ModelInstance = gstore.model('NewBlog', schema);
                sinon.spy(ModelInstance, 'delete');

                return ModelInstance.deleteAll().then(() => {
                    expect(spies.pre.callCount).equal(mockEntities.length);
                    expect(ModelInstance.delete.callCount).equal(mockEntities.length);
                    expect(ModelInstance.delete.getCall(0).args.length).equal(5);
                    expect(ModelInstance.delete.getCall(0).args[4].constructor.name).equal('Key');
                });
            });

            it('if post hooks, should call "delete" on all entities found (in series)', () => {
                schema = new Schema({});
                const spies = {
                    post: () => Promise.resolve(),
                };
                sinon.spy(spies, 'post');
                schema.post('delete', spies.post);

                ModelInstance = gstore.model('NewBlog', schema);
                sinon.spy(ModelInstance, 'delete');

                return ModelInstance.deleteAll().then(() => {
                    expect(spies.post.callCount).equal(mockEntities.length);
                    expect(ModelInstance.delete.callCount).equal(2);
                });
            });

            it('if NO hooks, should call delete passing an array of keys', () => {
                sinon.spy(ModelInstance, 'delete');

                return ModelInstance.deleteAll().then(() => {
                    expect(ModelInstance.delete.callCount).equal(1);

                    const { args } = ModelInstance.delete.getCall(0);
                    expect(args.length).equal(5);
                    expect(is.array(args[4])).equal(true);
                    expect(args[4]).deep.equal([mockEntities[0][ds.KEY], mockEntities[1][ds.KEY]]);

                    ModelInstance.delete.restore();
                });
            });

            it('should call with ancestors', () => {
                const ancestors = ['Parent', 'keyname'];

                return ModelInstance.deleteAll(ancestors).then(() => {
                    expect(queryMock.hasAncestor.calledOnce).equal(true);
                    expect(queryMock.ancestors.path).deep.equal(ancestors);
                });
            });

            it('should call with namespace', () => {
                const namespace = 'com.new-domain.dev';

                return ModelInstance.deleteAll(null, namespace).then(() => {
                    expect(ds.createQuery.getCall(0).args[0]).equal(namespace);
                });
            });

            it('should return success:true if all ok', () => ModelInstance.deleteAll().then((response) => {
                expect(response.success).equal(true);
            }));

            it('should return error if any while deleting', () => {
                const error = { code: 500, message: 'Could not delete' };
                sinon.stub(ModelInstance, 'delete').rejects(error);

                return ModelInstance.deleteAll().catch((err) => {
                    expect(err).equal(error);
                });
            });

            it('should delete entites by batches of 500', (done) => {
                ds.createQuery.restore();

                const entities = [];
                const entity = { name: 'Mick', lastname: 'Jagger' };
                entity[ds.KEY] = ds.key(['BlogPost', 'keyname']);

                for (let i = 0; i < 1200; i += 1) {
                    entities.push(entity);
                }

                const queryMock2 = new Query(ds, { entities });
                sinon.stub(ds, 'createQuery').callsFake(() => queryMock2);

                ModelInstance.deleteAll().then(() => {
                    expect(false).equal(false);
                    done();
                });
            });
        });

        describe('findAround()', () => {
            it('should get 3 entities after a given date', () => (
                ModelInstance.findAround('createdOn', '2016-1-1', { after: 3 })
                    .then((entities) => {
                        expect(queryMock.filter.getCall(0).args)
                            .deep.equal(['createdOn', '>', '2016-1-1']);
                        expect(queryMock.order.getCall(0).args)
                            .deep.equal(['createdOn', { descending: true }]);
                        expect(queryMock.limit.getCall(0).args[0]).equal(3);

                        // Make sure to not show properties where read is set to false
                        assert.isUndefined(entities[0].password);
                    })
            ));

            it('should get 3 entities before a given date', () => (
                ModelInstance.findAround('createdOn', '2016-1-1', { before: 12 }).then(() => {
                    expect(queryMock.filter.getCall(0).args).deep.equal(['createdOn', '<', '2016-1-1']);
                    expect(queryMock.limit.getCall(0).args[0]).equal(12);
                })
            ));

            it('should throw error if not all arguments are passed', () =>
                ModelInstance.findAround('createdOn', '2016-1-1')
                    .catch((err) => {
                        expect(err.code).equal(400);
                        expect(err.message).equal('Argument missing');
                    }));

            it('should validate that options passed is an object', () =>
                ModelInstance.findAround('createdOn', '2016-1-1', 'string', (err) => {
                    expect(err.code).equal(400);
                }));

            it('should validate that options has a "after" or "before" property', () =>
                ModelInstance.findAround('createdOn', '2016-1-1', {}, (err) => {
                    expect(err.code).equal(400);
                }));

            it('should validate that options has not both "after" & "before" properties', () =>
                ModelInstance.findAround('createdOn', '2016-1-1', { after: 3, before: 3 }, (err) => {
                    expect(err.code).equal(400);
                }));

            it('should add id to entities', () => (
                ModelInstance.findAround('createdOn', '2016-1-1', { before: 3 }).then((entities) => {
                    expect(entities[0].id).equal(mockEntities[0][ds.KEY].id);
                    expect(entities[1].id).equal(mockEntities[1][ds.KEY].name);
                })
            ));

            it('should read all properties', () => (
                ModelInstance.findAround('createdOn', '2016-1-1', { before: 3, readAll: true, format: 'ENTITY' })
                    .then((entities) => {
                        assert.isDefined(entities[0].password);
                        expect(entities[0].className).equal('Entity');
                    })
            ));

            it('should add entities key', () => (
                ModelInstance.findAround('createdOn', '2016-1-1', { before: 3, showKey: true })
                    .then((entities) => {
                        assert.isDefined(entities[0].__key);
                    })
            ));

            it('should accept a namespace', () => {
                const namespace = 'com.new-domain.dev';
                ModelInstance.findAround('createdOn', '2016-1-1', { before: 3 }, namespace).then(() => {
                    expect(ds.createQuery.getCall(0).args[0]).equal(namespace);
                });
            });

            it('should deal with err response', () => {
                queryMock.run.restore();
                const error = { code: 500, message: 'Server error' };
                sinon.stub(queryMock, 'run').rejects(error);

                return ModelInstance.findAround('createdOn', '2016-1-1', { after: 3 }).catch((err) => {
                    expect(err).equal(error);
                });
            });

            it(
                'should still work passing a callback',
                () => ModelInstance.findAround('createdOn', '2016-1-1', { after: 3 }, (err, entities) => {
                    expect(queryMock.filter.getCall(0).args)
                        .deep.equal(['createdOn', '>', '2016-1-1']);
                    expect(queryMock.order.getCall(0).args)
                        .deep.equal(['createdOn', { descending: true }]);
                    expect(queryMock.limit.getCall(0).args[0]).equal(3);

                    // Make sure to not show properties where read is set to false
                    assert.isUndefined(entities[0].password);
                })
            );
        });

        describe('findOne()', () => {
            it('should call pre and post hooks', () => {
                const spies = {
                    pre: () => Promise.resolve(),
                    post: () => Promise.resolve(),
                };
                sinon.spy(spies, 'pre');
                sinon.spy(spies, 'post');
                schema.pre('findOne', spies.pre);
                schema.post('findOne', spies.post);
                ModelInstance = Model.compile('Blog', schema, gstore);

                ModelInstance.findOne({}).then(() => {
                    expect(spies.pre.calledOnce).equal(true);
                    expect(spies.post.calledOnce).equal(true);
                    expect(spies.pre.calledBefore(queryMock.run)).equal(true);
                    expect(spies.post.calledAfter(queryMock.run)).equal(true);
                });
            });

            it('should run correct gcloud Query', () => (
                ModelInstance.findOne({ name: 'John', email: 'john@snow.com' }).then(() => {
                    expect(queryMock.filter.getCall(0).args)
                        .deep.equal(['name', 'John']);

                    expect(queryMock.filter.getCall(1).args)
                        .deep.equal(['email', 'john@snow.com']);
                })
            ));

            it('should return a Model instance', () => (
                ModelInstance.findOne({ name: 'John' }).then((entity) => {
                    expect(entity.entityKind).equal('Blog');
                    expect(entity instanceof Model).equal(true);
                })
            ));

            it('should validate that params passed are object', () => (
                ModelInstance.findOne('some string').catch((err) => {
                    expect(err.code).equal(400);
                })
            ));

            it('should accept ancestors', () => {
                const ancestors = ['Parent', 'keyname'];

                return ModelInstance.findOne({ name: 'John' }, ancestors, () => {
                    expect(queryMock.hasAncestor.getCall(0).args[0].path)
                        .deep.equal(ancestors);
                });
            });

            it('should accept a namespace', () => {
                const namespace = 'com.new-domain.dev';

                return ModelInstance.findOne({ name: 'John' }, null, namespace, () => {
                    expect(ds.createQuery.getCall(0).args[0]).equal(namespace);
                });
            });

            it('should deal with err response', () => {
                queryMock.run.restore();
                const error = { code: 500, message: 'Server error' };
                sinon.stub(queryMock, 'run').rejects(error);

                return ModelInstance.findOne({ name: 'John' }).catch((err) => {
                    expect(err).equal(error);
                });
            });

            it('if entity not found should return "ERR_ENTITY_NOT_FOUND"', () => {
                queryMock.run.restore();
                sinon.stub(queryMock, 'run').resolves();

                return ModelInstance.findOne({ name: 'John' }).catch((err) => {
                    expect(err.code).equal(gstore.errors.codes.ERR_ENTITY_NOT_FOUND);
                });
            });

            it('should still work with a callback', () => (
                ModelInstance.findOne({ name: 'John' }, (err, entity) => {
                    expect(entity.entityKind).equal('Blog');
                    expect(entity instanceof Model).equal(true);
                })
            ));

            it('should call pre hooks and override parameters', () => {
                const spyPre = sinon.stub().callsFake((...args) => {
                    // Make sure the original arguments are passed to the hook
                    if (args[0].name === 'John') {
                        // And override them
                        return Promise.resolve({
                            __override: [
                                { name: 'Mick', email: 'mick@jagger.com' },
                                ['Parent', 'default'],
                            ],
                        });
                    }
                    return Promise.resolve();
                });

                schema = new Schema({ name: { type: 'string' } });
                schema.pre('findOne', function preHook(...args) {
                    return spyPre.apply(this, args);
                });

                ModelInstance = Model.compile('Blog', schema, gstore);

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
        });
    });
});
