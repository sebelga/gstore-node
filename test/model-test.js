/*jshint -W030 */
var chai = require('chai');
var expect = chai.expect;

var sinon = require('sinon');

//var nconf = require('nconf');
//nconf.file({ file: './test/config.json' });
//var gcloud = require('gcloud')(nconf.get('gcloud'));
//var ds     = gcloud.datastore(nconf.get('gcloud-datastore'));

var Model  = require('../lib/model');
var Schema = require('../lib').Schema;

describe('Model', () => {
    "use strict";

    let schema;
    let ds;
    let ModelInstance;

    beforeEach(() => {
        schema = new Schema({});

        // Key Model Mock
        function Key() {};

        ds = {
            key: () => {return new Key();}
        };

        ModelInstance = Model.compile('Blog', schema, ds);
    });

    it ('should set properties on compile and return ModelInstance', () => {
        expect(Model.ds).to.exist;
        expect(Model.schema).to.exist;

        expect(ModelInstance).to.exist;
        expect(ModelInstance.hooks).to.exist;
        expect(ModelInstance.hooks).to.deep.equal(schema.s.hooks);
        expect(ModelInstance.entityName).to.exist;
        expect(ModelInstance.init).to.exist;
    });

    it('should apply schema methods to the model instances', () => {
        schema.method('doSomething', () => {console.log('hello');});

        ModelInstance = Model.compile('Blog', schema, ds);
        var model = new ModelInstance({});

        expect(model.doSomething).equal(schema.methods.doSomething);
    });

    it ('should emit "save" on save', () => {
        var model = new ModelInstance({name:'John'});
        var emit  = sinon.spy(model, 'emit');

        model.save();

        expect(emit.calledOnce).to.be.true;
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

        expect(findOnePre.calledOnce).to.be.true;
        expect(findOnePost.calledOnce).to.be.true;
    });
});
