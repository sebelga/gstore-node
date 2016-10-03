/*jshint -W030 */
const chai   = require('chai');
const expect = chai.expect;
const sinon  = require('sinon');
const async  = require('async');
const is     = require('is');

const ds = require('@google-cloud/datastore')({
    namespace : 'com.mydomain',
    apiEndpoint: 'http://localhost:8080'
});

const gstore              = require('../');
const Model               = require('../lib/model');
const Entity              = require('../lib/entity');
const Schema              = require('../lib').Schema;
const datastoreSerializer = require('../lib/serializer').Datastore;
const queryHelpers        = require('../lib/helper').QueryHelpers;

describe('Model', function() {
    'use strict';

    var schema;
    var ModelInstance;
    var clock;
    var mockEntity;
    var mockEntities;
    var transaction;

    beforeEach('Before each Model (global)', function() {
        gstore.models       = {};
        gstore.modelSchemas = {};
        gstore.options      = {};

        gstore.connect(ds);

        clock = sinon.useFakeTimers();

        schema = new Schema({
            name:     {type: 'string'},
            lastname: {type: 'string', excludeFromIndexes:true},
            age:      {type: 'int', excludeFromIndexes:true},
            birthday: {type: 'datetime'},
            street:   {},
            website:  {validate: 'isURL'},
            email:    {validate: 'isEmail'},
            modified: {type: 'boolean'},
            tags:     {type:'array'},
            prefs:    {type:'object'},
            price:    {type:'double', write:false},
            icon:     {type:'buffer'},
            location: {type:'geoPoint'},
            color:    {validate:'isHexColor'},
            type:     {values:['image', 'video']}
        });

        schema.virtual('fullname').get(function() {});

        sinon.stub(ds, 'save', (entity, cb) => {
            setTimeout(() => {
                cb(null ,entity);
            }, 20);
        });

        mockEntity = {
            key:ds.key(['BlogPost', 1234]),
            data:{
                name:'John',
                lastname:'Snow',
                email:'john@snow.com'
            }
        };

        mockEntities = [
            {
                key : ds.key(['BlogPost', 1234]),
                data: {
                    name: 'John',
                    lastname : 'Snow'
                }
            },
            {
                key : ds.key(['BlogPost', 'keyname']),
                data: {
                    name: 'Mick',
                    lastname : 'Jagger'
                }
            }
        ];

        sinon.stub(ds, 'runQuery', function(namespace, query, cb) {
            let args = [];
            for (let i = 0; i < arguments.length; i++) {
                args.push(arguments[i]);
            }
            cb = args.pop();

            //setTimeout(function() {
            return cb(null, mockEntities, {
                moreResults : ds.MORE_RESULTS_AFTER_LIMIT,
                endCursor: 'abcdef'
            });
            //}, 20);
        });

        function Transaction() {
            var _this = this;
            this.run      = function(cb) {cb();};
            this.get      = function(cb) {cb();};
            this.save     = function(cb) {cb();};
            this.delete   = function(cb) {cb();};
            this.commit   = function(cb) {cb();};
            this.rollback = function(cb) {cb();};
            this.createQuery = function() {return {
                filter:() => {},
                scope: _this
            }};
            this.runQuery = function() {};
        }
        transaction = new Transaction();

        sinon.stub(transaction, 'get', (key, cb) => {
            //setTimeout(() => {
                cb(null, mockEntity);
            //}, 20);
        });

        sinon.stub(transaction, 'save', function() {
            setTimeout(function() {
                return true;
            }, 20);
        });

        sinon.spy(transaction, 'run');
        sinon.spy(transaction, 'commit');
        sinon.spy(transaction, 'rollback');

        ModelInstance = gstore.model('Blog', schema, gstore);
    });

    afterEach(function() {
        ds.save.restore();
        ds.runQuery.restore();
        transaction.get.restore();
        transaction.save.restore();
        transaction.run.restore();
        transaction.commit.restore();
        transaction.rollback.restore();
    });

    describe('compile()', function() {
        beforeEach('Reset before compile', function() {
            gstore.models       = {};
            gstore.modelSchemas = {};
            ModelInstance = gstore.model('Blog', schema);
        });

        it('should set properties on compile and return ModelInstance', () => {
            expect(ModelInstance.schema).exist;
            expect(ModelInstance.gstore).exist;
            expect(ModelInstance.hooks).exist;
            expect(ModelInstance.hooks).deep.equal(schema.s.hooks);
            expect(ModelInstance.entityKind).exist;
            expect(ModelInstance.init).exist;
        });

        it('should create new models classes', () => {
            let User = Model.compile('User', new Schema({}), gstore);

            expect(User.entityKind).equal('User');
            expect(ModelInstance.entityKind).equal('Blog');
        });

        it('should execute methods passed to schema.methods', () => {
            let imageSchema = new Schema({});
            let ImageModel  = gstore.model('Image', imageSchema);
            sinon.stub(ImageModel, 'get', (id, cb) => {
                cb(null, mockEntities[0]);
            });
            schema.methods.fullName = function(cb) {
                cb(null, this.get('name') + ' ' + this.get('lastname'));
            };
            schema.methods.getImage = function(cb) {
                return this.model('Image').get(this.entityData.imageIdx, cb);
            };

            ModelInstance = gstore.model('MyEntity', schema);
            var model = new ModelInstance({name:'John', lastname:'Snow'});

            model.fullName((err, result) => {
                expect(result).equal('John Snow');
            });

            model.getImage.call(model, function(err, result) {
                expect(result).equal(mockEntities[0]);
            });
        });

        it('should execute static methods', () => {
            let schema = new Schema({});
            schema.statics.doSomething = () => 123;

            ModelInstance = gstore.model('MyEntity', schema);

            expect(ModelInstance.doSomething()).equal(123);
        });

        it('should throw error is trying to override reserved methods', () => {
            let schema = new Schema({});

            schema.statics.get = () => 123;
            let fn = () => gstore.model('MyEntity', schema);

            expect(fn).throw(Error);
        });
    });

    describe('sanitize()', () => {
        it('should remove keys not "writable"', () => {
            let data = {price: 20, unknown:'hello', name:'John'};

            data = ModelInstance.sanitize(data);

            expect(data.price).not.exist;
            expect(data.unknown).not.exist;
        });

        it('should convert "null" string to null', () => {
            let data = {
                name : 'null'
            };

            data = ModelInstance.sanitize(data);

            expect(data.name).equal(null);
        });

        it('return null if data is not an object', () => {
            let data = 'hello';

            data = ModelInstance.sanitize(data);

            expect(data).equal(null);
        });
    });

    describe('key()', function() {
        it('should create from entityKind', () => {
            let key = ModelInstance.key();

            expect(key.path[0]).equal('Blog');
            expect(key.path[1]).not.exist;
        });

        it('should parse string id "123" to integer', () => {
            let key = ModelInstance.key('123');

            expect(key.path[1]).equal(123);
        });

        it('should create array of ids', () => {
            let keys = ModelInstance.key([22, 69]);

            expect(is.array(keys)).be.true;
            expect(keys.length).equal(2);
            expect(keys[1].path[1]).equal(69);
        });

        it('should create array of ids with ancestors and namespace', () => {
            let namespace = 'com.mydomain-dev';
            let keys = ModelInstance.key([22, 69], ['Parent', 'keyParent'], namespace);

            expect(keys[0].path[0]).equal('Parent');
            expect(keys[0].path[1]).equal('keyParent');
            expect(keys[1].namespace).equal(namespace);
        });
    });

    describe('get()', () => {
        let entity;

        beforeEach(() => {
            entity = {
                key: ds.key(['BlogPost', 123]),
                data:{name:'John'}
            };
            sinon.stub(ds, 'get', (key, cb) => {
                //setTimeout(function() {
                    return cb(null, entity);
                //}, 20);
            });
        });

        afterEach(() => {
            ds.get.restore();
        });

        it('passing an integer id', () => {
            let result;
            ModelInstance.get(123, (err, entity) => {
                result = entity;
            });

            expect(ds.get.getCall(0).args[0].constructor.name).equal('Key');
            expect(result instanceof Entity).be.true;
        });

        it('passing an string id', () => {
            let result;
            ModelInstance.get('keyname', (err, res) => {result = res;});

            expect(result instanceof Entity).be.true;
        });

        it('passing an array of ids', () => {
            ds.get.restore();

            let entity1 = {
                key: ds.key(['BlogPost', 22]),
                data:{name:'John'}
            };

            let entity2 = {
                key: ds.key(['BlogPost', 69]),
                data:{name:'John'}
            };

            sinon.stub(ds, 'get', (key, cb) => {
                setTimeout(function() {
                    return cb(null, [entity2, entity1]); // not sorted
                }, 20);
            });

            ModelInstance.get([22, 69], null, null, null, {preserveOrder:true}, (err, res) => {
                expect(is.array(ds.get.getCall(0).args[0])).be.true;
                expect(is.array(res)).be.true;
                expect(res[0].entityKey.id).equal(22); // sorted
            });

            clock.tick(20);
        });

        it('converting a string integer to real integer', () => {
            ModelInstance.get('123', () => {});

            expect(ds.get.getCall(0).args[0].name).not.exist;
            expect(ds.get.getCall(0).args[0].id).equal(123);
        });

        it('not converting string with mix of number and non number', () => {
            ModelInstance.get('123:456', () => {});

            expect(ds.get.getCall(0).args[0].name).equal('123:456');
        });

        it('passing an ancestor path array', () => {
            let ancestors = ['Parent', 'keyname'];

            ModelInstance.get(123, ancestors, (err, result) => {});

            expect(ds.get.getCall(0).args[0].constructor.name).equal('Key');
            expect(ds.get.getCall(0).args[0].parent.kind).equal(ancestors[0]);
            expect(ds.get.getCall(0).args[0].parent.name).equal(ancestors[1]);
        });

        it('should allow a namespace', () => {
            let namespace = 'com.mydomain-dev';

            ModelInstance.get(123, null, namespace, (err, result) => {});

            expect(ds.get.getCall(0).args[0].namespace).equal(namespace);
        });

        it('on datastore get error, should return its error', () => {
            ds.get.restore();

            let error = {code:500, message:'Something went really bad'};
            sinon.stub(ds, 'get', (key, cb) => {
                return cb(error);
            });

            ModelInstance.get(123, (err, entity) => {
                expect(err).equal(error);
                expect(entity).not.exist;
            });
        });

        it('on no entity found, should return a 404 error', () => {
            ds.get.restore();

            sinon.stub(ds, 'get', (key, cb) => {
                return cb(null);
            });

            ModelInstance.get(123, (err, entity) => {
                expect(err.code).equal(404);
            });
        });

        it('should get in a transaction', function() {
            ModelInstance.get(123, null, null, transaction, function(err, entity) {
                expect(transaction.get.called).be.true;
                expect(ds.get.called).be.false;
                expect(entity.className).equal('Entity');
            });
        });

        it('should throw error if transaction not an instance of glcoud Transaction', function() {
            var fn = function() {
                ModelInstance.get(123, null, null, {}, (err, entity) => {
                    expect(transaction.get.called).be.true;
                });
            };

            expect(fn).to.throw(Error);
        });

        it('should return error from Transaction.get()', function() {
            transaction.get.restore();
            var error = {code:500, message: 'Houston we really need you'};
            sinon.stub(transaction, 'get', function(key, cb) {
                cb(error);
            });

            ModelInstance.get(123, null, null, transaction, (err, entity) => {
                expect(err).equal(error);
                expect(entity).not.exist;
            });
        });
    });

    describe('update()', () => {
        beforeEach(function() {
            sinon.stub(ds, 'transaction', function(cb, done) {
                // return cb(transaction, function() {
                //     done();
                // });
                return transaction;
            });
        });

        afterEach(() => {
            ds.transaction.restore();
        });

        it('should run in a transaction', function(){
            ModelInstance.update(123, () => {});

            expect(ds.transaction.called).be.true;
            expect(transaction.run.called).be.true;
            expect(transaction.commit.called).be.true;
        });

        it('should run an entity instance', function(){
            ModelInstance.update(123, (err, entity) => {
                expect(entity.className).equal('Entity');
            });
        });

        it('should first get the entity by Key', () => {
            ModelInstance.update(123, () => {});

            expect(transaction.get.getCall(0).args[0].constructor.name).equal('Key');
            expect(transaction.get.getCall(0).args[0].path[1]).equal(123);
        });

        it('not converting string id with mix of number and alpha chars', () => {
            ModelInstance.update('123:456', () => {});

            expect(transaction.get.getCall(0).args[0].name).equal('123:456');
        });

        it('should rollback if error while getting entity', function(done) {
            transaction.get.restore();
            let error = {code:500, message:'Houston we got a problem'};
            sinon.stub(transaction, 'get', (key, cb) => {
                return cb(error);
            });

            ModelInstance.update(123, (err) => {
                expect(err).equal(error);
                expect(transaction.commit.called).be.false;
                done();
            });
        });

        it('should return 404 if entity not found', () => {
            transaction.get.restore();
            sinon.stub(transaction, 'get', (key, cb) => {
                return cb(null);
            });

            ModelInstance.update('keyname', (err, entity) => {
                expect(err.code).equal(404);
                expect(entity).not.exist;
            });
        });

        it('should return error if any while saving', (done) => {
            transaction.run.restore();
            let error = {code:500, message: 'Houston wee need you.'};
            sinon.stub(transaction, 'run', function(cb) {
                return cb(error);
            });

            ModelInstance.update(123, (err) => {
                expect(err).equal(error);
                done();
            });

            clock.tick(40);
        });

        it('accept an ancestor path', () => {
            let ancestors = ['Parent', 'keyname'];

            ModelInstance.update(123, {}, ancestors, (err, entity) => {
                expect(transaction.get.getCall(0).args[0].path[0]).equal('Parent');
                expect(transaction.get.getCall(0).args[0].path[1]).equal('keyname');
            });
        });

        it('should allow a namespace', () => {
            let namespace = 'com.mydomain-dev';

            ModelInstance.update(123, {}, null, namespace, (err, result) => {
                expect(transaction.get.getCall(0).args[0].namespace).equal(namespace);
            });
        });

        it('should save and replace data', (done) => {
            let data = {
                name : 'Mick'
            };
            ModelInstance.update(123, data, null, null, null, {replace:true}, (err, entity) => {
                expect(entity.entityData.name).equal('Mick');
                expect(entity.entityData.lastname).not.exist;
                expect(entity.entityData.email).not.exist;
            });

            clock.tick(60);
            done();
        });

        it('should merge the new data with the entity data', (done) => {
            let data = {
                name : 'Sebas',
                lastname : 'Snow'
            };
            ModelInstance.update(123, data, ['Parent', 'keyNameParent'], (err, entity) => {
                expect(entity.entityData.name).equal('Sebas');
                expect(entity.entityData.lastname).equal('Snow');
                expect(entity.entityData.email).equal('john@snow.com');
            });

            clock.tick(60);
            done();
        });

        it('should call save() on the transaction', (done) => {
            ModelInstance.update(123, {}, (err, entity) => {});

            clock.tick(40);

            expect(transaction.save.called).be.true;

            done();
        });

        it('should return error and rollback transaction if not passing validation', function(done) {
            ModelInstance.update(123, {unknown:1}, (err, entity) => {
                expect(err).exist;
                expect(entity).not.exist;
                expect(transaction.rollback.called).be.true;
                done();
            });

            clock.tick(20);
        });

        it('should return error if not passing validation', function(done) {
            ModelInstance.update(123, {unknown:1}, null, null, null, {replace:true}, (err, entity) => {
                expect(err).exist;
                expect(entity).not.exist;
                done();
            });

            clock.tick(20);
        });

        it('should run inside an EXISTING transaction', () => {
            ModelInstance.update(123, {}, null, null, transaction, (err, entity) => {
                expect(ds.transaction.called).be.false;
                expect(transaction.get.called).be.true;
                expect(transaction.save.called).be.true;
                expect(entity.className).equal('Entity');
            });

            clock.tick(40);
        });

        it('should throw error if transaction passed is not instance of gcloud Transaction', () => {
            var fn = function() {
                ModelInstance.update(123, {}, null, null, {}, (err, entity) => {});
            };

            expect(fn).to.throw(Error);
        });

        it('should set save options "op" to "update" ', (done) => {
            ModelInstance.update(123, {}, (err, entity, info) => {
                expect(info.op).equal('update');
                done();
            });

            clock.tick(40);
        });
    });

    describe('delete()', () => {
        beforeEach(() => {
            sinon.stub(ds, 'delete', (key, cb) => {
                cb(null, {indexUpdates:3});
            });
            sinon.stub(transaction, 'delete', (key) => {
                return true;
            });
        });

        afterEach(() => {
            ds.delete.restore();
            transaction.delete.restore();
        });

        it('should call ds.delete with correct Key (int id)', (done) => {
            ModelInstance.delete(123, (err, response) => {
                expect(ds.delete.called).be.true;
                expect(ds.delete.getCall(0).args[0].constructor.name).equal('Key');
                expect(response.success).be.true;
                done();
            });
        });

        it('should call ds.delete with correct Key (string id)', (done) => {
            ModelInstance.delete('keyName', (err, response) => {
                expect(ds.delete.called).be.true;
                expect(ds.delete.getCall(0).args[0].path[1]).equal('keyName');
                expect(response.success).be.true;
                done();
            });
        });

        it('not converting string id with mix of number and alpha chars', (done) => {
            ModelInstance.delete('123:456', () => {
                expect(ds.delete.getCall(0).args[0].name).equal('123:456');
                done();
            });
        });

        it('should allow array of ids', (done) => {
            ModelInstance.delete([22, 69], (err, response) => {
                expect(is.array(ds.delete.getCall(0).args[0])).be.true;
                done();
            });
        });

        it('should allow ancestors', (done) => {
            ModelInstance.delete(123, ['Parent', 123], () => {
                let key = ds.delete.getCall(0).args[0];

                expect(key.parent.kind).equal('Parent');
                expect(key.parent.id).equal(123);
                done();
            });
        });

        it('should allow a namespace', (done) => {
            let namespace = 'com.mydomain-dev';

            ModelInstance.delete('keyName', null, namespace, (err, response) => {
                let key = ds.delete.getCall(0).args[0];

                expect(key.namespace).equal(namespace);
                done();
            });
        });

        it('should delete entity in a transaction', function(done) {
            ModelInstance.delete(123, null, null, transaction, function(err, result) {
                expect(transaction.delete.called).be.true;
                expect(transaction.delete.getCall(0).args[0].path[1]).equal(123);
                done();
            });
            clock.tick(20);
        });

        it('should throw error if transaction passed is not instance of gcloud Transaction', () => {
            var fn = function() {
                ModelInstance.delete(123, null, null, {}, function(err, result) {});
            };

            clock.tick(20);

            expect(fn).to.throw(Error);
        });

        it ('should set "success" to false if no entity deleted', () => {
            ds.delete.restore();
            sinon.stub(ds, 'delete', (key, cb) => {
                cb(null, {indexUpdates:0});
            });

            ModelInstance.delete(123, (err, response) => {
                expect(response.success).be.false;
            });
        });

        it ('should not set success neither apiRes', () => {
            ds.delete.restore();
            sinon.stub(ds, 'delete', (key, cb) => {
                cb(null, {});
            });

            ModelInstance.delete(123, (err, response) => {
                expect(response.success).not.exist;
                expect(response.apiRes).not.exist;
            });
        });

        it ('should deal with err response', () => {
            ds.delete.restore();
            let error = {code:500, message:'We got a problem Houston'};
            sinon.stub(ds, 'delete', (key, cb) => {
                return cb(error);
            });

            ModelInstance.delete(123, (err, success) => {
                expect(err).deep.equal(error);
                expect(success).not.exist;
            });
        });

        it('should call pre hooks', () => {
            let spyPre = sinon.spy();
            schema.pre('delete', (next) => {
                spyPre();
                next();
            });
            ModelInstance = Model.compile('Blog', schema, gstore);

            ModelInstance.delete(123, (err, success) => {});

            expect(spyPre.calledBefore(ds.delete)).be.true;
        });

        it('should set "pre" hook scope to entity being deleted', () => {
            schema.pre('delete', function(next) {
                expect(this.className).equal('Entity');
                next();
            });
            ModelInstance = Model.compile('Blog', schema, gstore);

            ModelInstance.delete(123, (err, success) => {});
        });

        it('should NOT set "pre" hook scope if deleting array of ids', () => {
            schema.pre('delete', function(next) {
                expect(this).not.exist;
                next();
            });
            ModelInstance = Model.compile('Blog', schema, gstore);

            ModelInstance.delete([123, 456], (err, success) => {});
        });

        it('should call post hooks', (done) => {
            let spyPost   = sinon.spy();
            schema.post('delete', () => {
                spyPost();
            });
            ModelInstance = Model.compile('Blog', schema, gstore);

            ModelInstance.delete(123, (err, result) => {
                expect(spyPost.called).be.true;
                done();
            });
        });

        it('should pass key deleted to post hooks', (done) => {
            schema.post('delete', function(keys) {
                expect(keys.constructor.name).equal('Key');
                expect(keys.id).equal(123);
                done();
            });
            ModelInstance = Model.compile('Blog', schema, gstore);

            ModelInstance.delete(123, (err, result) => {});
        });

        it('should pass array of keys deleted to post hooks', (done) => {
            var ids = [123,456];
            schema.post('delete', function(keys) {
                expect(keys.length).equal(ids.length);
                expect(keys[1].id).equal(456);
                done();
            });
            ModelInstance = Model.compile('Blog', schema, gstore);

            ModelInstance.delete(ids, (err, result) => {});
        });

        it('transaction.execPostHooks() should call post hooks', (done) => {
            let spyPost   = sinon.spy();
            schema = new Schema({name:{type:'string'}});
            schema.post('delete', spyPost);

            ModelInstance = Model.compile('Blog', schema, gstore);

            ModelInstance.delete(123, null, null, transaction, (err, result) => {
                transaction.execPostHooks();
                expect(spyPost.called).be.true;
                done();
            });
        });
    });

    describe('hooksTransaction()', function() {
        it('should add hooks to a transaction', () => {
            ModelInstance.hooksTransaction(transaction);

            expect(transaction.hooks).exist;
            expect(transaction.hooks.post.length).equal(0);
            expect(transaction.addHook).exist;
            expect(transaction.execPostHooks).exist;
        });

        it ('should not override hooks on transition', function() {
            var hooks = {post:[]};
            transaction.hooks = hooks;


            ModelInstance.hooksTransaction(transaction);

            expect(transaction.hooks).equal(hooks);
        })

        it('--> execPostHooks() should call each post hook on transaction', () => {
            let spy  = sinon.spy();
            ModelInstance.hooksTransaction(transaction);
            transaction.hooks.post = [spy, spy];

            transaction.execPostHooks();

            expect(spy.callCount).equal(2);
        });
    });

    describe('gcloud-node queries', () => {
        it ('should be able to create gcloud-node Query object', () => {
            let query  = ModelInstance.query();

            expect(query.constructor.name).equal('Query');
        });

        it ('should be able to execute all gcloud-node queries', () => {
            let fn = () => {
                let query  = ModelInstance.query()
                    .filter('name', '=', 'John')
                    .filter('age', '>=', 4)
                    .order('lastname', {
                        descending: true
                    });
                return query;
            };

            expect(fn).to.not.throw(Error);
        });

        it ('should throw error if calling unregistered query method', () => {
            let fn = () => {
                let query  = ModelInstance.query()
                            .unkown('test', false);
                return query;
            };

            expect(fn).to.throw(Error);
        });

        it('should run query', (done) => {
            let query = ModelInstance.query()
                        .filter('name', '=', 'John');

            query.run((err, response) => {
                expect(ds.runQuery.getCall(0).args[0]).equal(query);
                expect(response.entities.length).equal(2);
                expect(response.nextPageCursor).equal('abcdef');
                done();
            });
        });

        it('should not add endCursor to response', function(done){
            ds.runQuery.restore();
            sinon.stub(ds, 'runQuery', function(query, cb) {
                return cb(null, [], {moreResults : ds.NO_MORE_RESULTS});
            });
            let query = ModelInstance.query()
                        .filter('name', '=', 'John');

            query.run((err, response) => {
                expect(response.nextPageCursor).not.exist;
                done();
            });
        });

        it('should not return entities', (done) => {
            ds.runQuery.restore();
            sinon.stub(ds, 'runQuery', (query, cb) => {
                cb({code:400, message: 'Something went wrong doctor'});
            });
            let query = ModelInstance.query();
            var result;

            query.run((err, entities) => {
                if (!err) {
                    result = entities;
                }
                done();
            });

            expect(result).to.not.exist;
        });

        it('should allow options for query', () => {
            let query = ModelInstance.query();

            var _result;
            query.run({simplifyResult:false}, (err, result) => {
                _result = result;
            });

            expect(_result.entities).equal(mockEntities);
        });

        it('should allow a namespace for query', () => {
            let namespace = 'com.mydomain-dev';
            let query     = ModelInstance.query(namespace);

            expect(query.namespace).equal(namespace);
        });

        it('should create query on existing transaction', function(done) {
            let query = ModelInstance.query(null, transaction);
            query.filter('name', '=', 'John');

            query.run((err, response) => {
                expect(response.entities.length).equal(2);
                expect(response.nextPageCursor).equal('abcdef');
                expect(query.scope.constructor.name).equal('Transaction');
                done();
            });
        });

        it('should not set transaction if not an instance of gcloud Transaction', function() {
            var fn = function() {
                let query = ModelInstance.query(null, {});
            };

            expect(fn).to.throw(Error);
        });
    });

    describe('shortcut queries', () => {
        describe('list', () =>  {
            it('should work with no settings defined', function() {
                ds.runQuery.restore();
                sinon.stub(ds, 'runQuery', function(query, cb) {
                    setTimeout(function() {
                        return cb(null, mockEntities, {
                            moreResults : ds.MORE_RESULTS_AFTER_LIMIT,
                            endCursor: 'abcdef'
                        });
                    }, 20);
                });

                ModelInstance.list((err, response) => {
                    expect(response.entities.length).equal(2);
                    expect(response.nextPageCursor).equal('abcdef');
                });

                clock.tick(20);
            });

            it('should not add endCursor to response', function(){
                ds.runQuery.restore();
                sinon.stub(ds, 'runQuery', function(query, cb) {
                    setTimeout(function() {
                        return cb(null, mockEntities, {moreResults : ds.NO_MORE_RESULTS});
                    }, 20);
                });

                ModelInstance.list((err, response) => {
                    expect(response.nextPageCursor).not.exist;
                });

                clock.tick(20);
            });

            it('should read settings defined', () => {
                let querySettings = {
                    limit:10
                };
                schema.queries('list', querySettings);
                ModelInstance = Model.compile('Blog', schema, gstore);
                sinon.spy(queryHelpers, 'buildFromOptions');

                ModelInstance.list(() => {});

                expect(queryHelpers.buildFromOptions.getCall(0).args[1].limit).equal(querySettings.limit);
                expect(ds.runQuery.getCall(0).args[0].limitVal).equal(10);

                queryHelpers.buildFromOptions.restore();
            });

            it('should override setting with options)', () => {
                let querySettings = {
                    limit:10
                };
                schema.queries('list', querySettings);
                ModelInstance = Model.compile('Blog', schema, gstore);
                sinon.spy(queryHelpers, 'buildFromOptions');

                ModelInstance.list({limit:15, simplifyResult:false}, () => {});

                expect(queryHelpers.buildFromOptions.getCall(0).args[1]).not.deep.equal(querySettings);
                expect(ds.runQuery.getCall(0).args[0].limitVal).equal(15);

                queryHelpers.buildFromOptions.restore();
            });

            it('should deal with err response', () => {
                ds.runQuery.restore();
                sinon.stub(ds, 'runQuery', (query, cb) => {
                    return cb({code:500, message:'Server error'});
                });

                let result;
                ModelInstance.list((err, entities) => {
                    if (!err) {
                        result = entities;
                    }
                });

                expect(result).not.exist;
            });

            it('should accept a namespace ', () => {
                let namespace = 'com.mydomain-dev';

                ModelInstance.list({namespace:namespace}, () => {});

                let query = ds.runQuery.getCall(0).args[0];
                expect(query.namespace).equal(namespace);
            });
        });

        describe('deleteAll()', () => {
            beforeEach(() => {
                sinon.spy(ModelInstance, 'delete');

                sinon.stub(ds, 'delete', function() {
                    let args = Array.prototype.slice.call(arguments);
                    let cb   = args.pop();
                    return cb(null, {});
                });

                sinon.spy(async, 'eachSeries');
            });

            afterEach(() => {
                ModelInstance.delete.restore();
                ds.delete.restore();
                async.eachSeries.restore();
            });

            it('should get all entities through Query', (done) => {
                ModelInstance.deleteAll(() => {done();});
                let arg = ds.runQuery.getCall(0).args[0];

                expect(ds.runQuery.called).true;
                expect(arg.constructor.name).equal('Query');
                expect(arg.kinds[0]).equal('Blog');
                expect(arg.namespace).equal('com.mydomain');
            });

            it('should return error if could not fetch entities', (done) => {
                let error = {code:500, message:'Something went wrong'};
                ds.runQuery.restore();
                sinon.stub(ds, 'runQuery', function() {
                    let args = Array.prototype.slice.call(arguments);
                    let cb = args.pop();
                    return cb(error);
                });

                ModelInstance.deleteAll((err) => {
                    expect(err).deep.equal(error);
                    done();
                });
            });

            it('if pre OR post hooks, should call delete on all entities found (in series)', function(done) {
                schema = new Schema({});
                schema.pre('delete', function(next){next();});
                schema.post('delete', function() {});
                ModelInstance = gstore.model('NewBlog', schema);
                sinon.spy(ModelInstance, 'delete');

                ModelInstance.deleteAll(function(){
                    expect(async.eachSeries.called).be.true;
                    expect(ModelInstance.delete.callCount).equal(2);
                    expect(ModelInstance.delete.getCall(0).args.length).equal(6);
                    expect(ModelInstance.delete.getCall(0).args[4].constructor.name).equal('Key');
                    done();
                });
            });

            it('if NO hooks, should call delete passing an array of keys', function(done) {
                ModelInstance.deleteAll(function() {
                    expect(ModelInstance.delete.callCount).equal(1);

                    let args = ModelInstance.delete.getCall(0).args;
                    expect(args.length).equal(6);
                    expect(is.array(args[4])).be.true;
                    expect(args[4]).deep.equal([mockEntities[0].key, mockEntities[1].key]);

                    done();
                });
            });

            it('should call with ancestors', (done) => {
                let ancestors = ['Parent', 'keyname'];
                ModelInstance.deleteAll(ancestors, () => {done();});

                let arg = ds.runQuery.getCall(0).args[0];
                expect(arg.filters[0].op).equal('HAS_ANCESTOR');
                expect(arg.filters[0].val.path).deep.equal(ancestors);
            });

            it('should call with namespace', (done) => {
                let namespace = 'com.new-domain.dev';
                ModelInstance.deleteAll(null, namespace, () => {done();});

                let arg = ds.runQuery.getCall(0).args[0];
                expect(arg.namespace).equal(namespace);
            });

            it ('should return success:true if all ok', (done) => {
                ModelInstance.deleteAll((err, msg) => {
                    expect(err).not.exist;
                    expect(msg.success).be.true;
                    done();
                });
            });

            it ('should return error if any while deleting', (done) => {
                let error = {code:500, message:'Could not delete'};
                ModelInstance.delete.restore();
                sinon.stub(ModelInstance, 'delete', function() {
                    let args = Array.prototype.slice.call(arguments);
                    let cb = args.pop();
                    cb(error);
                });

                ModelInstance.deleteAll((err, msg) => {
                    expect(err).equal(error);
                    expect(msg).not.exist;
                    done();
                });
            });
        });

        describe('findAround()', function() {
            it('should get 3 entities after a given date', function() {
                ModelInstance.findAround('createdOn', '2016-1-1', {after:3}, () => {});
                let query = ds.runQuery.getCall(0).args[0];

                expect(query.filters[0].name).equal('createdOn');
                expect(query.filters[0].op).equal('>');
                expect(query.filters[0].val).equal('2016-1-1');
                expect(query.limitVal).equal(3);
            });

            it ('should get 3 entities before a given date', function() {
                ModelInstance.findAround('createdOn', '2016-1-1', {before:12, simplifyResult:false}, () => {});
                let query = ds.runQuery.getCall(0).args[0];

                expect(query.filters[0].op).equal('<');
                expect(query.limitVal).equal(12);
            });

            it('should validate that all arguments are passed', function() {
                ModelInstance.findAround('createdOn', '2016-1-1', (err) => {
                    expect(err.code).equal(400);
                    expect(err.message).equal('Argument missing');
                });
            });

            it('should validate that options passed is an object', function(done) {
                ModelInstance.findAround('createdOn', '2016-1-1', 'string', (err) => {
                    expect(err.code).equal(400);
                    done();
                });
            });

            it('should validate that options has a "after" or "before" property', function(done) {
                ModelInstance.findAround('createdOn', '2016-1-1', {}, (err) => {
                    expect(err.code).equal(400);
                    done();
                });
            });

            it('should validate that options has not both "after" & "before" properties', function() {
                ModelInstance.findAround('createdOn', '2016-1-1', {after:3, before:3}, (err) => {
                    expect(err.code).equal(400);
                });
            });

            it('should override "simplifyResult" settings', function() {
                datastoreSerializer.fromDatastore
                sinon.spy(datastoreSerializer, 'fromDatastore');
                schema = new Schema({name:{}}, {queries:{simplifyResult:true}});
                ModelInstance = gstore.model('Entity', schema);

                ModelInstance.findAround('createdOn', '2016-1-1', {after:3, simplifyResult:false}, () => {});

                expect(datastoreSerializer.fromDatastore.called).be.false;
                datastoreSerializer.fromDatastore.restore();
            });

            it('should accept a namespace', function() {
                let namespace = 'com.new-domain.dev';
                ModelInstance.findAround('createdOn', '2016-1-1', {before:3}, namespace, () => {});

                let query = ds.runQuery.getCall(0).args[0];
                expect(query.namespace).equal(namespace);
            });

            it('should deal with err response', () => {
                ds.runQuery.restore();
                sinon.stub(ds, 'runQuery', (query, cb) => {
                    return cb({code:500, message:'Server error'});
                });

                ModelInstance.findAround('createdOn', '2016-1-1', {after:3}, (err) => {
                    expect(err.code).equal(500);
                });
            });
        });

        describe('findOne()', () => {
            it('should call pre and post hooks', () => {
                var spy = {
                    fnPre : function(next) {
                        //console.log('Spy Pre Method Schema');
                        next();
                    },
                    fnPost: function(next) {
                        //console.log('Spy Post Method Schema');
                        next();
                    }
                };
                var findOnePre  = sinon.spy(spy, 'fnPre');
                var findOnePost = sinon.spy(spy, 'fnPost');
                schema.pre('findOne', findOnePre);
                schema.post('findOne', findOnePost);
                ModelInstance = Model.compile('Blog', schema, gstore);

                ModelInstance.findOne({}, () => {});

                expect(findOnePre.calledOnce).be.true;
                expect(findOnePost.calledOnce).to.be.true;
            });

            it('should run correct gcloud Query', function(done) {
                ModelInstance.findOne({name:'John', email:'john@snow.com'}, () => {
                    let query = ds.runQuery.getCall(0).args[0];

                    expect(query.filters[0].name).equal('name');
                    expect(query.filters[0].op).equal('=');
                    expect(query.filters[0].val).equal('John');

                    expect(query.filters[1].name).equal('email');
                    expect(query.filters[1].op).equal('=');
                    expect(query.filters[1].val).equal('john@snow.com');
                    done();
                });
            });

            it('should return a Model instance', function(done) {
                ModelInstance.findOne({name:'John'}, (err, entity) => {
                    expect(entity.entityKind).equal('Blog');
                    expect(entity instanceof Model).be.true;
                    done();
                });
            });

            it('should validate that params passed are object', function() {
                ModelInstance.findOne('some string', (err, entity) => {
                    expect(err.code).equal(400);
                });
            });

            it('should accept ancestors', function(done) {
                let ancestors = ['Parent', 'keyname'];

                ModelInstance.findOne({name:'John'}, ancestors, () => {
                    let query = ds.runQuery.getCall(0).args[0];

                    expect(query.filters[1].name).equal('__key__');
                    expect(query.filters[1].op).equal('HAS_ANCESTOR');
                    expect(query.filters[1].val.path).deep.equal(ancestors);
                    done();
                });
            });

            it('should accept a namespace', function(done) {
                let namespace = 'com.new-domain.dev';

                ModelInstance.findOne({name:'John'}, null, namespace, () => {
                    let query = ds.runQuery.getCall(0).args[0];

                    expect(query.namespace).equal(namespace);
                    done();
                });
            });

            it('should deal with err response', (done) => {
                ds.runQuery.restore();
                sinon.stub(ds, 'runQuery', (query, cb) => {
                    return cb({code:500, message:'Server error'});
                });

                ModelInstance.findOne({name:'John'}, (err, entities) => {
                    expect(err.code).equal(500);
                    done();
                });
            });

            it('if entity not found should return 404', (done) => {
                ds.runQuery.restore();
                sinon.stub(ds, 'runQuery', (query, cb) => {
                    return cb(null);
                });

                ModelInstance.findOne({name:'John'}, (err, entities) => {
                    expect(err.code).equal(404);
                    done();
                });
            });
        })

        describe('excludeFromIndexes', function() {
            it('should add properties to schema as optional', function() {
                let arr = ['newProp', 'url'];
                ModelInstance.excludeFromIndexes(arr);

                let model = new ModelInstance({});

                expect(model.excludeFromIndexes).deep.equal(['lastname', 'age'].concat(arr));
                expect(schema.path('newProp').optional).be.true;
            });

            it('should only modifiy excludeFromIndexes on properties that already exist', function() {
                let prop = 'lastname';
                ModelInstance.excludeFromIndexes(prop);

                let model = new ModelInstance({});

                expect(model.excludeFromIndexes).deep.equal(['lastname', 'age']);
                expect(schema.path('lastname').optional).not.exist;
                expect(schema.path('lastname').excludeFromIndexes).be.true;
            });
        });
    });

    describe('save()', () => {
        let model;
        let data = {name:'John', lastname:'Snow'};

        beforeEach(() => {
            model = new ModelInstance(data);
        });

        it('---> should validate() before', () => {
            let validateSpy = sinon.spy(model, 'validate');

            model.save(() => {});

            expect(validateSpy.called).be.true;
        });

        it('---> should NOT validate() data before', () => {
            schema        = new Schema({}, {validateBeforeSave: false});
            ModelInstance = Model.compile('Blog', schema, gstore);
            model         = new ModelInstance({name: 'John'});
            let validateSpy = sinon.spy(model, 'validate');

            model.save(() => {});

            expect(validateSpy.called).be.false;
        });

        it('should NOT save to Datastore if it didn\'t pass property validation', () => {
            model = new ModelInstance({unknown:'John'});

            model.save(() => {});

            expect(ds.save.called).be.false;
        });

        it('should NOT save to Datastore if it didn\'t pass value validation', () => {
            model = new ModelInstance({website:'mydomain'});

            model.save(() => {});

            expect(ds.save.called).be.false;
        });

        it('should convert to Datastore format before saving to Datastore', function(done) {
            let spySerializerToDatastore = sinon.spy(datastoreSerializer, 'toDatastore');

            model.save((err, entity) => {});
            clock.tick(20);

            expect(model.gstore.ds.save.calledOnce).be.true;
            expect(spySerializerToDatastore.called).be.true;
            expect(spySerializerToDatastore.getCall(0).args[0]).equal(model.entityData);
            expect(spySerializerToDatastore.getCall(0).args[1]).equal(model.excludeFromIndexes);
            expect(model.gstore.ds.save.getCall(0).args[0].key).exist;
            expect(model.gstore.ds.save.getCall(0).args[0].key.constructor.name).equal('Key');
            expect(model.gstore.ds.save.getCall(0).args[0].data).exist;
            expect(model.gstore.ds.save.getCall(0).args[0].data[0].excludeFromIndexes).exist;

            done();
            spySerializerToDatastore.restore();
        });

        it('if Datastore error, return the error and don\'t call emit', () => {
            ds.save.restore();

            let error = {
                code:500,
                message:'Server Error'
            };
            sinon.stub(ds, 'save', (entity, cb) => {
                return cb(error);
            });

            let model = new ModelInstance({});

            model.save((err, entity) => {
                expect(err).equal(error);
            });
        });

        it('should save entity in a transaction', function() {
            model.save(transaction, {}, function(err, entity, info) {
                expect(transaction.save.called).be.true;
                expect(entity.entityData).exist;
                expect(info.op).equal('save');
            });

            clock.tick(20);
        });

        it('should save entity in a transaction WITHOUT passing callback', function() {
            model.save(transaction);

            clock.tick(20);

            expect(transaction.save.called).be.true;
        });

        it('should throw error if transaction not instance of Transaction', function() {
            var fn = function() {
                model.save({id:0}, {}, function() {});
            };

            clock.tick(20);

            expect(fn).to.throw(Error);
        });

        it('should call pre hooks', () => {
            let mockDs = {save:function() {}, key:function(){}};
            let spyPre  = sinon.spy();
            let spySave = sinon.spy(mockDs, 'save');

            schema = new Schema({name:{type:'string'}});
            schema.pre('save', (next) => {
                spyPre();
                next();
            });
            ModelInstance = Model.compile('Blog', schema, gstore);
            let model = new ModelInstance({name:'John'});

            model.save(() => {});
            clock.tick(20);

            expect(spyPre.calledBefore(spySave)).be.true;
        });

        it('should emit "save" after', (done) => {
            let model       = new ModelInstance({});
            let emitStub    = sinon.stub(model, 'emit');
            let callbackSpy = sinon.spy();

            model.save(callbackSpy);
            clock.tick(20);

            expect(emitStub.calledWithExactly('save')).be.true;
            expect(emitStub.calledBefore(callbackSpy)).be.true;
            done();

            emitStub.restore();
        });

        it('should call post hooks', () => {
            let spyPost  = sinon.spy();

            schema = new Schema({name:{type:'string'}});
            schema.post('save', () => {
                spyPost();
            });

            ModelInstance = Model.compile('Blog', schema, gstore);
            let model = new ModelInstance({name:'John'});

            model.save(() => {});
            clock.tick(20);

            expect(spyPost.called).be.true;
        });

        it('transaction.execPostHooks() should call post hooks', () => {
            let spyPost   = sinon.spy();
            schema        = new Schema({name:{type:'string'}});
            schema.post('save', spyPost);

            ModelInstance = Model.compile('Blog', schema, gstore);
            let model = new ModelInstance({name:'John'});

            model.save(transaction, () => {
                transaction.execPostHooks();
            });
            clock.tick(20);

            expect(spyPost.called).be.true;
        });

        it('should update modifiedOn to new Date if property in Schema', () => {
            schema = new Schema({modifiedOn: {type: 'datetime'}});
            var model  = gstore.model('BlogPost', schema);

            var entity = new model({});
            entity.save((err, entity) => {});
            clock.tick(20);

            expect(entity.entityData.modifiedOn).to.exist;
            expect(entity.entityData.modifiedOn.toString()).to.equal(new Date().toString());
        });
    });

    describe('validate()', () => {
        it('properties passed ok', () => {
            let model = new ModelInstance({name:'John', lastname:'Snow'});

            let valid = model.validate();
            expect(valid.success).be.true;
        });

        it('properties passed ko', () => {
            let model = new ModelInstance({unknown:123});

            let valid = model.validate();

            expect(valid.success).be.false;
        });

        it('should remove virtuals', () => {
            let model = new ModelInstance({fullname:'John Snow'});

            let valid = model.validate();

            expect(valid.success).be.true;
            expect(model.entityData.fullname).not.exist;
        });

        it('accept unkwown properties', () => {
            schema = new Schema({
                name:     {type: 'string'},
            }, {
                explicitOnly : false
            });
            ModelInstance = Model.compile('Blog', schema, gstore);
            let model = new ModelInstance({unknown:123});

            let valid = model.validate();

            expect(valid.success).be.true;
        });

        it ('no type validation', () => {
            let model = new ModelInstance({street:123});
            let model2 = new ModelInstance({street:'123'});
            let model3 = new ModelInstance({street:true});

            let valid = model.validate();
            let valid2 = model2.validate();
            let valid3 = model3.validate();

            expect(valid.success).be.true;
            expect(valid2.success).be.true;
            expect(valid3.success).be.true;
        });

        it ('--> string', () => {
            let model = new ModelInstance({name:123});

            let valid = model.validate();

            expect(valid.success).be.false;
        });

        it ('--> number', () => {
            let model = new ModelInstance({age:'string'});

            let valid = model.validate();

            expect(valid.success).be.false;
        });

        it('--> int', () => {
            let model = new ModelInstance({age:ds.int('str')});
            let valid = model.validate();

            let model2 = new ModelInstance({age:ds.int('7')});
            let valid2 = model2.validate();

            let model3 = new ModelInstance({age:ds.int(7)});
            let valid3 = model3.validate();

            let model4 = new ModelInstance({age:'string'});
            let valid4 = model4.validate();

            let model5 = new ModelInstance({age:'7'});
            let valid5 = model5.validate();

            let model6 = new ModelInstance({age:7});
            let valid6 = model6.validate();

            expect(valid.success).be.false;
            expect(valid2.success).be.true;
            expect(valid3.success).be.true;
            expect(valid4.success).be.false;
            expect(valid5.success).be.false;
            expect(valid6.success).be.true;
        });

        it('--> double', () => {
            let model = new ModelInstance({price:ds.double('str')});
            let valid = model.validate();

            let model2 = new ModelInstance({price:ds.double('1.2')});
            let valid2 = model2.validate();

            let model3 = new ModelInstance({price:ds.double(7.0)});
            let valid3 = model3.validate();

            let model4 = new ModelInstance({price:'string'});
            let valid4 = model4.validate();

            let model5 = new ModelInstance({price:'7'});
            let valid5 = model5.validate();

            let model6 = new ModelInstance({price:7});
            let valid6 = model6.validate();

            let model7 = new ModelInstance({price:7.59});
            let valid7 = model7.validate();

            expect(valid.success).be.false;
            expect(valid2.success).be.true;
            expect(valid3.success).be.true;
            expect(valid4.success).be.false;
            expect(valid5.success).be.false;
            expect(valid6.success).be.true;
            expect(valid7.success).be.true;
        });

        it('--> buffer', () => {
            let model = new ModelInstance({icon:'string'});
            let valid = model.validate();

            let model2 = new ModelInstance({icon:new Buffer('\uD83C\uDF69')});
            let valid2 = model2.validate();

            expect(valid.success).be.false;
            expect(valid2.success).be.true;
        });

        it ('--> boolean', () => {
            let model = new ModelInstance({modified:'string'});

            let valid = model.validate();

            expect(valid.success).be.false;
        });

        it('--> object', () => {
            let model = new ModelInstance({prefs:{check:true}});

            let valid = model.validate();

            expect(valid.success).be.true;
        });

        it('--> geoPoint', () => {
            let model = new ModelInstance({location:'string'});
            let valid = model.validate();

            let model2 = new ModelInstance({location:ds.geoPoint({
                                latitude: 40.6894,
                                longitude: -74.0447
                            })});
            let valid2 = model2.validate();

            expect(valid.success).be.false;
            expect(valid2.success).be.true;
        });

        it('--> array ok', () => {
            let model = new ModelInstance({tags:[]});

            let valid = model.validate();

            expect(valid.success).be.true;
        });

        it('--> array ko', () => {
            let model = new ModelInstance({tags:{}});
            let model2 = new ModelInstance({tags:'string'});
            let model3 = new ModelInstance({tags:123});

            let valid = model.validate();
            let valid2 = model2.validate();
            let valid3 = model3.validate();

            expect(valid.success).be.false;
            expect(valid2.success).be.false;
            expect(valid3.success).be.false;
        });

        it('--> date ok', () => {
            let model = new ModelInstance({birthday:'2015-01-01'});
            let model2 = new ModelInstance({birthday:new Date()});

            let valid = model.validate();
            let valid2 = model2.validate();

            expect(valid.success).be.true;
            expect(valid2.success).be.true;
        });

        it ('--> date ko', () => {
            let model = new ModelInstance({birthday:'01-2015-01'});
            let model2 = new ModelInstance({birthday:'01-01-2015'});
            let model3 = new ModelInstance({birthday:'2015/01/01'});
            let model4 = new ModelInstance({birthday:'01/01/2015'});
            let model5 = new ModelInstance({birthday:12345}); // No number allowed
            let model6 = new ModelInstance({birthday:'string'});

            let valid  = model.validate();
            let valid2 = model2.validate();
            let valid3 = model3.validate();
            let valid4 = model4.validate();
            let valid5 = model5.validate();
            let valid6 = model6.validate();

            expect(valid.success).be.false;
            expect(valid2.success).be.false;
            expect(valid3.success).be.false;
            expect(valid4.success).be.false;
            expect(valid5.success).be.false;
            expect(valid6.success).be.false;
        });

         it ('--> is URL ok', () => {
            let model  = new ModelInstance({website:'http://google.com'});
            let model2 = new ModelInstance({website:'google.com'});

            let valid = model.validate();
            let valid2 = model2.validate();

            expect(valid.success).be.true;
            expect(valid2.success).be.true;
        });

        it ('--> is URL ko', () => {
            let model = new ModelInstance({website:'domain.k'});

            let valid = model.validate();

            expect(valid.success).be.false;
        });

        it ('--> is EMAIL ok', () => {
            let model  = new ModelInstance({email:'john@snow.com'});

            let valid = model.validate();

            expect(valid.success).be.true;
        });

        it ('--> is EMAIL ko', () => {
            let model   = new ModelInstance({email:'john@snow'});
            let model2  = new ModelInstance({email:'john@snow.'});
            let model3  = new ModelInstance({email:'john@snow.k'});
            let model4  = new ModelInstance({email:'johnsnow.com'});

            let valid = model.validate();
            let valid2 = model2.validate();
            let valid3 = model3.validate();
            let valid4 = model4.validate();

            expect(valid.success).be.false;
            expect(valid2.success).be.false;
            expect(valid3.success).be.false;
            expect(valid4.success).be.false;
        });

        it('--> is HexColor', () => {
            let model  = new ModelInstance({color:'#fff'});
            let model2  = new ModelInstance({color:'white'});

            let valid = model.validate();
            let valid2 = model2.validate();

            expect(valid.success).be.true;
            expect(valid2.success).be.false;
        });

        it ('and only accept value in default values', () => {
            let model = new ModelInstance({type:'other'});

            let valid = model.validate();

            expect(valid.success).be.false;
        });
    });
});
