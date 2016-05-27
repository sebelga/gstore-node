/*jshint -W030 */
var chai = require('chai');
var expect = chai.expect;

var sinon = require('sinon');

var nconf = require('nconf');
nconf.file({ file: './test/config.json' });
var gcloud = require('gcloud')(nconf.get('gcloud'));
var ds     = gcloud.datastore(nconf.get('gcloud-datastore'));

var Model      = require('../lib/model');
var Schema     = require('../lib').Schema;
var serializer = require('../lib/services/serializer');

describe('Model', () => {
    "use strict";

    let schema;
    let ModelInstance;
    let clock;

    beforeEach(() => {
        clock = sinon.useFakeTimers();

        schema = new Schema({
            name:     {type:      'string'},
            lastname: {type:      'string', excludedFromIndex:true},
            age:      {type:      'number', excludedFromIndex:true},
            birthday: {type:      'datetime'},
            street:   {},
            website:  {validate: 'isURL'},
            email:    {validate: 'isEmail'},
            type:     {values:    ['image', 'video']}
        });

        sinon.stub(ds, 'save', (entity, cb) => {
            setTimeout(() => {
                cb(null ,entity);
            }, 20);
        });

        ModelInstance = Model.compile('Blog', schema, ds);
    });

    afterEach(() => {
        try {
            ds.save.restore();
        } catch(e) {}
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

        it ('default validates to string', () => {
            let model = new ModelInstance({street:123});

            let valid = model.validate();

            expect(valid.success).be.false;
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

        it('--> date property ok', () => {
            let model = new ModelInstance({birthday:'2015-01-01'});

            let valid = model.validate();

            expect(valid.success).be.true;
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

        beforeEach(() => {
            let data  = {name:'John', lastname:'Snow'};
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
            schema = new Schema({}, {validateBeforeSave: false});
            ModelInstance = Model.compile('Blog', schema, ds);
            model  = new ModelInstance({name:'John'});
            let validateSpy = sinon.spy(model, 'validate');

            model.save(() => {});

            expect(validateSpy.called).be.false;
        });

        it('should NOT save to dataStore if it didn\'t pass the validation', () => {
            model  = new ModelInstance({unknown:'John'});

            model.save(() => {});

            expect(ds.save.called).be.false;
        });

        it('should convert to Datastore format and save entity', function(done) {
            let spySerializerToDatastore = sinon.spy(serializer.ds, 'toDatastore');

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
        });

        it('if datastore error, return the error and don\'t call emit', () => {
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
});
