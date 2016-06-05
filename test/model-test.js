/*jshint -W030 */
var chai   = require('chai');
var expect = chai.expect;
var sinon  = require('sinon');
var async  = require('async');

var gcloud = require('gcloud')({
    projectId: 'my-project'
});
var ds = gcloud.datastore({
    namespace : 'com.mydomain',
    apiEndpoint: 'http://localhost:8080'
});

var datastools          = require('../');
var Model               = require('../lib/model');
var Schema              = require('../lib').Schema;
var datastoreSerializer = require('../lib/serializer').Datastore;
var queryHelpers        = require('../lib/helper').QueryHelpers;

describe('Model', () => {
    'use strict';

    let schema;
    let ModelInstance;
    let clock;
    let mockEntities;

    beforeEach('Before each describe...', function() {
        datastools.models       = {};
        datastools.modelSchemas = {};
        datastools.options      = {};

        datastools.connect(ds);

        clock = sinon.useFakeTimers();

        schema = new Schema({
            name:     {type: 'string'},
            lastname: {type: 'string', excludedFromIndex:true},
            age:      {type: 'number', excludedFromIndex:true},
            birthday: {type: 'datetime'},
            street:   {},
            website:  {validate: 'isURL'},
            email:    {validate: 'isEmail'},
            modified: {type: 'boolean'},
            tags:     {type:'array'},
            prefs:    {type:'object'},
            color:    {validate:'isHexColor'},
            type:     {values:['image', 'video']}
        });

        sinon.stub(ds, 'save', (entity, cb) => {
            setTimeout(() => {
                cb(null ,entity);
            }, 20);
            // return cb(null, entity);
        });

        mockEntities = [
            {
                key: {
                    namespace: undefined,
                    id: 1234,
                    kind: "BlogPost",
                    path: ["BlogPost", 1234]
                },
                data: {
                    name: "John",
                    lastname : 'Snow'
                }
            },
            {
                key: {
                    namespace: undefined,
                    name: 'keyname',
                    kind: "BlogPost",
                    path: ["BlogPost", 'keyname']
                },
                data: {
                    name: "Mick",
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

            // setTimeout(() => {
            //     return cb(null, mockEntities);
            // }, 20);
            return cb(null, mockEntities);
        });

        ModelInstance = datastools.model('Blog', schema, ds);
    });

    afterEach(function() {
        ds.save.restore();
        ds.runQuery.restore();
    });

    describe('compile()', function() {
        beforeEach('Reset before compile', function() {
            datastools.models       = {};
            datastools.modelSchemas = {};
            ModelInstance = datastools.model('Blog', schema);
        });

        it ('should set properties on compile and return ModelInstance', () => {
            expect(ModelInstance.schema).exist;
            expect(ModelInstance.ds).exist;
            expect(ModelInstance.hooks).exist;
            expect(ModelInstance.hooks).deep.equal(schema.s.hooks);
            expect(ModelInstance.entityName).exist;
            expect(ModelInstance.init).exist;
        });

        it ('should create new models classes', () => {
            let User = Model.compile('User', new Schema({}), ds);

            expect(User.entityName).equal('User');
            expect(ModelInstance.entityName).equal('Blog');
        });

        it('should be able to return model instances', () => {
            let imageSchema = new Schema({});
            let ImageModel  = datastools.model('Image', imageSchema);

            let blog = new ModelInstance({});

            expect(blog.model('Image')).equal(ImageModel);
        });

        it('should be able to execute methods from other model instances', () => {
            let imageSchema = new Schema({});
            let ImageModel  = datastools.model('Image', imageSchema);
            sinon.stub(ImageModel, 'get', (cb) => {
                cb(null, mockEntities[0]);
            });

            let blog = new ModelInstance({});

            blog.model('Image').get((err, entity) => {
                expect(entity).equal(mockEntities[0]);
            });
        });

        it('should execute methods passed to schema.methods', () => {
            let imageSchema = new Schema({});
            let ImageModel  = datastools.model('Image', imageSchema);
            sinon.stub(ImageModel, 'get', (id, cb) => {
                cb(null, mockEntities[0]);
            });
            schema.methods.fullName = function(cb) {
                var entityData = this.entityData;
                cb(null, entityData.name + ' ' + entityData.lastname);
            };
            schema.methods.getImage = function(cb) {
                return this.model('Image').get(this.entityData.imageIdx, cb);
            };

            ModelInstance = datastools.model('MyEntity', schema, ds);
            var model = new ModelInstance({name:'John', lastname:'Snow'});

            model.fullName((err, result) => {
                expect(result).equal('John Snow');
            });

            model.getImage.call(model, function(err, result) {
                expect(result).equal(mockEntities[0]);
            });
        });
    });

    describe('validate()', () => {
        it('properties passed ok', () => {
            let model = new ModelInstance({name:'John', lastname:'Snow'});

            let valid = model.validate();
            expect(valid.success).be.true;
        });

        it('properties passed ko', () => {
            let model = new ModelInstance({unkown:123});

            let valid = model.validate();

            expect(valid.success).be.false;
        });

        it('allow unkwown properties', () => {
            schema = new Schema({
                name:     {type: 'string'},
            }, {
                explicitOnly : false
            });
            ModelInstance = Model.compile('Blog', schema, ds);
            let model = new ModelInstance({unkown:123});

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

        it ('--> string property', () => {
            let model = new ModelInstance({name:123});

            let valid = model.validate();

            expect(valid.success).be.false;
        });

        it ('--> number property', () => {
            let model = new ModelInstance({age:'string'});

            let valid = model.validate();

            expect(valid.success).be.false;
        });

        it ('--> boolean property', () => {
            let model = new ModelInstance({modified:'string'});

            let valid = model.validate();

            expect(valid.success).be.false;
        });

        it('--> object property', () => {
            let model = new ModelInstance({prefs:{check:true}});

            let valid = model.validate();

            expect(valid.success).be.true;
        });

        it('--> array property ok', () => {
            let model = new ModelInstance({tags:[]});

            let valid = model.validate();

            expect(valid.success).be.true;
        });

        it('--> array property ko', () => {
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

        it('--> date property ok', () => {
            let model = new ModelInstance({birthday:'2015-01-01'});
            let model2 = new ModelInstance({birthday:new Date()});

            let valid = model.validate();
            let valid2 = model2.validate();

            expect(valid.success).be.true;
            expect(valid2.success).be.true;
        });

        it ('--> date property ko', () => {
            let model = new ModelInstance({birthday:'01-2015-01'});
            let model2 = new ModelInstance({birthday:'01-01-2015'});
            let model3 = new ModelInstance({birthday:'2015/01/01'});
            let model4 = new ModelInstance({birthday:'01/01/2015'});
            let model5 = new ModelInstance({birthday:12345}); // No number allowed
            let model6 = new ModelInstance({birthday:'string'});

            let valid = model.validate();
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

    describe('get()', () => {
        let entity;

        beforeEach(() => {
            entity = {
                key:{id:123, path:['BlogPost', 123]},
                data:{name:'John'}
            };
            sinon.stub(ds, 'get', (key, cb) => {
                return cb(null, entity);
            });
        });

        afterEach(() => {
            ds.get.restore();
        });

        it('passing an integer id', () => {
            let result;
            ModelInstance.get(123, (err, res) => {result = res;});

            expect(ds.get.getCall(0).args[0].constructor.name).equal('Key');
            expect(result).equal(entity);
        });

        it('passing an string id', () => {
            let result;
            ModelInstance.get('keyname', (err, res) => {result = res;});

            expect(result).equal(entity);
        });

        it('converting a string integer to real integer', () => {
            ModelInstance.get('123', () => {});

            expect(ds.get.getCall(0).args[0].name).not.exist;
            expect(ds.get.getCall(0).args[0].id).equal(123);
        });

        it('passing an ancestor path array', () => {
            let ancestors = ['Parent', 'keyname'];

            ModelInstance.get(123, ancestors, (err, result) => {});

            expect(ds.get.getCall(0).args[0].constructor.name).equal('Key');
            expect(ds.get.getCall(0).args[0].parent.kind).equal(ancestors[0]);
            expect(ds.get.getCall(0).args[0].parent.name).equal(ancestors[1]);
        });

        it('should add a "simplify()" method to the entity', () => {
            ModelInstance.get(123, () => {});

            expect(entity.simplify).exist;
        });

        it('resulting "entity.simplify()" should create a simpler object of entity', () => {
            ModelInstance.get(123, (err, entity) => {
                let output = entity.simplify();

                expect(output.id).equal(entity.key.id);
                expect(output.key).not.exist;
            });
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
    });

    describe('save()', () => {
        let model;
        let data = {name:'John', lastname:'Snow'};

        beforeEach(() => {
            model = new ModelInstance(data);
        });

        it('---> should validate() before', () => {
            model  = new ModelInstance({name:'John'});
            let validateSpy = sinon.spy(model, 'validate');

            model.save(() => {});

            expect(validateSpy.called).be.true;
        });

        it('---> should NOT validate() data before', () => {
            schema        = new Schema({}, {validateBeforeSave: false});
            ModelInstance = Model.compile('Blog', schema, ds);
            model         = new ModelInstance({name: 'John'});
            let validateSpy = sinon.spy(model, 'validate');

            model.save(() => {});

            expect(validateSpy.called).be.false;
        });

        it('should NOT save to Datastore if it didn\'t pass property validation', () => {
            model  = new ModelInstance({unknown:'John'});

            model.save(() => {});

            expect(ds.save.called).be.false;
        });

        it('should NOT save to Datastore if it didn\'t pass value validation', () => {
            model  = new ModelInstance({website:'mydomain'});

            model.save(() => {});

            expect(ds.save.called).be.false;
        });

        it('should convert to Datastore format before saving to Datastore', function(done) {
            let spySerializerToDatastore = sinon.spy(datastoreSerializer, 'toDatastore');

            model.save(() => {});
            clock.tick(20);

            expect(model.ds.save.calledOnce).be.true;
            expect(spySerializerToDatastore.called).be.true;
            expect(spySerializerToDatastore.getCall(0).args[0]).equal(model.entityData);
            expect(spySerializerToDatastore.getCall(0).args[1]).equal(model.excludeFromIndexes);
            expect(model.ds.save.getCall(0).args[0].key).exist;
            expect(model.ds.save.getCall(0).args[0].key.constructor.name).equal('Key');
            expect(model.ds.save.getCall(0).args[0].data).exist;
            expect(model.ds.save.getCall(0).args[0].data[0].excludeFromIndexes).exist;

            done();
            spySerializerToDatastore.restore();
        });

        it('should save to datastore and add a "simplify()" method to entity', () => {
            let output;
            let error;

             model.save({}, (err, entity) => {
                 error = err;
                 output = entity.simplify();
             });
             clock.tick(20);

             expect(error).not.exist;
             expect(output.id).equal(model.entityKey.path[1]);
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

            let model       = new ModelInstance({});
            let emitStub    = sinon.stub(model, 'emit');
            let callbackSpy = sinon.spy();

            model.save(callbackSpy);

            expect(emitStub.called).be.false;
            expect(callbackSpy.getCall(0).args[0]).equal(error);

            emitStub.restore();
        });

        it('should save entity into a transaction');

        it('should call pre hooks', () => {
            let mockDs = {save:function() {}, key:function(){}};
            let spyPre  = sinon.spy();
            let spySave = sinon.spy(mockDs, 'save');

            schema = new Schema({name:{type:'string'}});
            schema.pre('save', (next) => {
                spyPre();
                next();
            });
            ModelInstance = Model.compile('Blog', schema, mockDs);
            let model = new ModelInstance({name:'John'});

            model.save({}, () => {});
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
            ModelInstance = Model.compile('Blog', schema, ds);
            let model = new ModelInstance({name:'John'});

            model.save({}, () => {});
            clock.tick(20);

            expect(spyPost.called).be.true;
        });
    });

    describe('update()', () => {
        let mockEntity = {
            key:{
                id:1,
                path:['BlogPost', 1234]
            },
            data:{
                name:'John',
                email:'john@snow.com'
            }
        };

        beforeEach(() => {
            sinon.stub(ds, 'get', (key, cb) => {
                // return cb(null, mockEntity);
                setTimeout(() => {
                    cb(null ,mockEntity);
                }, 20);
            });
        });

        afterEach(() => {
            ds.get.restore();
        });

        it ('should get the entity a Key of the id', () => {
            ModelInstance.update(123, () => {});

            expect(ds.get.getCall(0).args[0].constructor.name).equal('Key');
            expect(ds.get.getCall(0).args[0].path[1]).equal(123);
        });

        it ('should not do anything if err while getting entity', () => {
            ds.get.restore();
            sinon.stub(ds, 'get', (id, cb) => {
                return cb({code:500, message:'Houston we got a problem'});
            });

            ModelInstance.update(123, (err) => {
                expect(err.code).equal(500);
            });
        });

        it('should return 404 if entity found', () => {
            ds.get.restore();
            sinon.stub(ds, 'get', (key, cb) => {
                return cb(null);
            });

            ModelInstance.update(123, (err, entity) => {
                expect(err.code).equal(404);
                expect(entity).not.exist;
            });
        });

        it ('should return error if any while saving', () => {
            let error = {code:500, message: 'Houston wee need you.'};
            ds.save.restore();
            sinon.stub(ds, 'save', function() {
                let args = Array.prototype.slice.call(arguments);
                let cb = args.pop();
                return cb(error);
            });

            ModelInstance.update(123, (err, entity) => {
                expect(err).equal(error);
            });

            clock.tick(20);
        });

        it('should merge the new data with the entity data', (done) => {
            let data = {
                name : 'Sebas',
                lastname : 'Snow'
            };
            ModelInstance.update(123, data, ['Parent', 'keyNameParent'], (err, entity) => {
                expect(entity.data.name).equal('Sebas');
                expect(entity.data.lastname).equal('Snow');
                expect(entity.data.email).equal('john@snow.com');
            });

            clock.tick(60);
            done();
        });

        it('should save the entity', (done) => {
            let data = {lastname : 'Snow'};
            let _entity;
            ModelInstance.update(123, data, (err, entity) => {
                _entity = entity;
            });

            clock.tick(40);

            expect(ds.save.called).be.true;
            expect(_entity.simplify).exist;

            done();
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
                //setTimeout(function() {
                    cb(null, {indexUpdates:3});
                //}, 20);
            });
        });

        afterEach(() => {
            ds.delete.restore();
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

        it('should allow ancestors', (done) => {
            ModelInstance.delete(123, ['Parent', 123], () => {
                var key = ds.delete.getCall(0).args[0];

                expect(key.parent.kind).equal('Parent');
                expect(key.parent.id).equal(123);
                done();
            });
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
            let mockDs    = {delete:function() {}, key:function(){}};
            let spyPre    = sinon.spy();
            let spyDelete = sinon.spy(mockDs, 'delete');

            schema = new Schema({name:{type:'string'}});
            schema.pre('delete', (next) => {
                spyPre();
                next();
            });
            ModelInstance = Model.compile('Blog', schema, mockDs);

            ModelInstance.delete(123, (err, success) => {});

            expect(spyPre.calledBefore(spyDelete)).be.true;
        });

        it('should call post hooks', (done) => {
            let spyPost   = sinon.spy();

            schema = new Schema({name:{type:'string'}});
            schema.post('delete', () => {
                spyPost();
            });
            ModelInstance = Model.compile('Blog', schema, ds);

            ModelInstance.delete(123, (err, result) => {
                expect(spyPost.called).be.true;
                done();
            });
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

            var result;
            query.run((err, entities) => {
                result = entities;
                done();
            });

            expect(ds.runQuery.getCall(0).args[0]).equal(query);
            expect(result).to.exist;
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

            var result;
            query.run({simplifyResult:false}, (err, entities) => {
                result = entities;
            });

            expect(result).equal(mockEntities);
        });

        it('should allow a namespace for query', () => {
            let namespace = 'com.mydomain-dev';
            let query     = ModelInstance.query(namespace);

            expect(query.namespace).equal(namespace);
        });
    });

    describe('shortcut queries', () => {
        describe('list', () =>  {
            it('should work with no settings defined', (done) => {
                let result;
                ModelInstance.list((err, entities) => {
                    result = entities;
                    done();
                });

                expect(result).exist;
            });

            it('should read settings defined', () => {
                let querySettings = {
                    limit:10
                };
                schema.queries('list', querySettings);
                ModelInstance = Model.compile('Blog', schema, ds);
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
                ModelInstance = Model.compile('Blog', schema, ds);
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
                    let cb = args.pop();

                    //setTimeout(() => {
                        return cb(null, true);
                    //}, 20)
                });
            });

            afterEach(() => {
                ModelInstance.delete.restore();
                ds.delete.restore();
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

            it('should call delete on all entities found (in series)', (done) => {
                sinon.spy(async, 'eachSeries');

                ModelInstance.deleteAll(() => {
                    expect(async.eachSeries.called).be.true;
                    expect(ModelInstance.delete.callCount).equal(2);
                    done();
                    async.eachSeries.restore();
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

        describe('findOne', () => {
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
                ModelInstance = Model.compile('Blog', schema, ds);

                ModelInstance.findOne({});

                expect(findOnePre.calledOnce).be.true;
                expect(findOnePost.calledOnce).to.be.true;
            });
        })
    });
});
