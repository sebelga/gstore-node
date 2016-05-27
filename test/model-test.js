/*jshint -W030 */
var chai = require('chai');
var expect = chai.expect;

var sinon = require('sinon');

var nconf = require('nconf');
nconf.file({ file: './test/config.json' });
var gcloud = require('gcloud')(nconf.get('gcloud'));
var ds     = gcloud.datastore(nconf.get('gcloud-datastore'));

var Model  = require('../lib/model');
var Schema = require('../lib').Schema;

describe('Model', () => {
    "use strict";

    let schema;
    let ModelInstance;
    let clock;

    beforeEach(() => {
        clock = sinon.useFakeTimers();

        schema = new Schema({
            name : {type:'string'},
            lastname: {type:'string'}
        });

        // Key Model Mock
        function Key() {}

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

    it('should emit "save" on save', (done) => {
        let model       = new ModelInstance({});
        let emitStub    = sinon.stub(model, 'emit');
        let callbackSpy = sinon.spy();

        model.save(callbackSpy);
        clock.tick(20);

        expect(emitStub.calledWithExactly('save')).be.true;
        expect(emitStub.calledBefore(callbackSpy)).be.true;
        done();
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

    it('should convert to Datastore format and save entity', function(done) {
        let data  = {name:'John', lastname:'Snow'};
        let model = new ModelInstance(data);

        model.save(() => {});
        clock.tick(20);

        // TODO add assertion for excludeFromIndex True / False
        expect(model.ds.save.calledOnce).be.true;
        expect(model.ds.save.getCall(0).args[0].key).exist;
        expect(model.ds.save.getCall(0).args[0].key.constructor.name).equal('Key');
        expect(model.ds.save.getCall(0).args[0].data).exist;
        expect(model.ds.save.getCall(0).args[0].data[0].excludeFromIndexes).exist;

        done();
    });

    it('should save entity in a transaction');
});
