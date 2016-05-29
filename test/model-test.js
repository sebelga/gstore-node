/*jshint -W030 */
var chai = require('chai');
var expect = chai.expect;

var sinon = require('sinon');

var gcloud = require('gcloud')({
    projectId: 'my-project'
});
var ds = gcloud.datastore({
    namespace : 'com.mydomain'
});

var Model               = require('../lib/model');
var Schema              = require('../lib').Schema;
var datastoreSerializer = require('../lib/serializer').Datastore;
var queryHelpers        = require('../lib/helper').QueryHelpers;

describe('Model', () => {
    "use strict";

    let schema;
    let ModelInstance;
    let clock;

    let mockEntities;

    beforeEach(() => {
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
            type:     {values:['image', 'video']}
        });

        sinon.stub(ds, 'save', (entity, cb) => {
            setTimeout(() => {
                cb(null ,entity);
            }, 20);
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
            }
        ];
        sinon.stub(ds, 'runQuery', (query, cb) => {
            return cb(null, mockEntities);
        });

        ModelInstance = Model.compile('Blog', schema, ds);
    });

    afterEach(() => {
        ds.save.restore();
        ds.runQuery.restore();
    });

    it ('should set properties on compile and return ModelInstance', () => {
        expect(Model.schema).exist;

        expect(ModelInstance).exist;
        expect(ModelInstance.ds).exist;
        expect(ModelInstance.hooks).exist;
        expect(ModelInstance.hooks).deep.equal(schema.s.hooks);
        expect(ModelInstance.entityName).exist;
        expect(ModelInstance.init).exist;
    });

    it('should apply schema methods to the model instances', () => {
        schema.method('doSomething', () => {console.log('hello');});

        ModelInstance = Model.compile('Blog', schema, ds);
        var model = new ModelInstance({});

        expect(model.doSomething).equal(schema.methods.doSomething);
    });

    it('should call pre and post hooks for findOne', () => {
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

    describe('should validate Schema', () => {
        it('properties passed ok', () => {
            let model = new ModelInstance({name:'John', lastname:'Snow'});

            let valid = model.validate();
            expect(valid.success).be.true;
        });

        it ('properties passed ko', () => {
            let model = new ModelInstance({unkown:123});

            let valid = model.validate();

            expect(valid.success).be.false;
        });

        // it ('default validates to string', () => {
        //     let model = new ModelInstance({street:123});
        //
        //     let valid = model.validate();
        //
        //     expect(valid.success).be.false;
        // });

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
            let model  = new ModelInstance({email:'john@snow'});
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

        it ('and only accept value in default values', () => {
            let model = new ModelInstance({type:'other'});

            let valid = model.validate();

            expect(valid.success).be.false;
        });
    });

    describe('when saving entity', () => {
        let model;
        let data = {name:'John', lastname:'Snow'};

        beforeEach(() => {
            model = new ModelInstance(data);
        });

        it('should emit "save" on save', (done) => {
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

        it('should save to Datastore but before convert to Datastore format', function(done) {
            let spySerializerToDatastore = sinon.spy(datastoreSerializer, 'toDatastore');

            model.save(() => {});
            clock.tick(20);

            expect(model.ds.save.calledOnce).be.true;
            expect(spySerializerToDatastore.called).be.true;
            expect(spySerializerToDatastore.getCall(0).args[0]).equal(model.entityData);
            expect(spySerializerToDatastore.getCall(0).args[1]).equal(model.excludedFromIndexes);
            expect(model.ds.save.getCall(0).args[0].key).exist;
            expect(model.ds.save.getCall(0).args[0].key.constructor.name).equal('Key');
            expect(model.ds.save.getCall(0).args[0].data).exist;
            expect(model.ds.save.getCall(0).args[0].data[0].excludeFromIndexes).exist;

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

            let model       = new ModelInstance({});
            let emitStub    = sinon.stub(model, 'emit');
            let callbackSpy = sinon.spy();

            model.save(callbackSpy);

            expect(emitStub.called).be.false;
            expect(callbackSpy.getCall(0).args[0]).equal(error);

            emitStub.restore();
        });

        it('should save entity into a transaction');
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

        it ('should run query', (done) => {
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
    });

    describe('shortcut queries', () => {
        it('---> list (no settings defined)', (done) => {
            let result;
            ModelInstance.list((err, entities) => {
                result = entities;
                done();
            });

            expect(result).exist;
        });

        it('---> list (settings defined)', () => {
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

        it('---> list (inline options override)', () => {
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

        it('---> list (dealing with err response', () => {
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
    });

    describe('should get an entity by key', () => {
        let entity;

        beforeEach(() => {
            entity = {
                key:{id:123},
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

        it('resulting "entity.simplify()" should call datastoreSerializer', () => {
            sinon.stub(datastoreSerializer, 'fromDatastore', () => {return true;});
            ModelInstance.get(123, () => {});

            let output = entity.simplify();

            expect(datastoreSerializer.fromDatastore.called).be.true;
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
});
