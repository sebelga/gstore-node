/*jshint -W030 */
var chai   = require('chai');
var expect = chai.expect;
var sinon  = require('sinon');

var gcloud = require('gcloud')({
    projectId: 'my-project'
});
var ds = gcloud.datastore({
    namespace : 'com.mydomain'
});

var datastools = require('../lib');
datastools.connect(ds);

var Schema = require('../lib').Schema;
var schema;

describe('Entity', () => {
    "use strict";

    beforeEach(() => {
        schema = new Schema({
            name    : {type: 'string'}
        });
        sinon.stub(ds, 'save', (entity, cb) => {
            cb(null, entity);
        });
    });

    afterEach(() => {
        datastools.models       = {};
        datastools.modelSchemas = {};
        datastools.options      = {};

        ds.save.restore();
    });

    it('should initialized properties', (done) => {
        let model  = datastools.model('BlogPost', schema);

        let entity = new model({}, 'keyid');

        expect(entity.entityData).to.exist;
        expect(entity.entityKey).to.exist;
        expect(entity.schema).to.exist;
        expect(entity.excludedFromIndexes).deep.equal([]);
        expect(entity.pre).to.exist;
        expect(entity.post).to.exist;

        done();
    });

    it('should add data passed to entityData', () => {
        let model  = datastools.model('BlogPost', schema);

        let entity = new model({name:'John'});

        expect(entity.entityData.name).to.equal('John');
    });

    it('should not add any data if nothing is passed', () => {
        schema = new Schema({
            name    : {type: 'string', optional:true}
        });
        let model = datastools.model('BlogPost', schema);

        let entity = new model();

        expect(Object.keys(entity.entityData).length).to.equal(0);
    });

    it ('should set default values or null from schema', () => {
        schema = new Schema({
            name:{type:'string', default:'John'},
            lastname: {type: 'string'},
            email:{optional:true}
        });
        let model = datastools.model('BlogPost', schema);

        let entity = new model({});

        expect(entity.entityData.name).equal('John');
        expect(entity.entityData.lastname).equal(null);
        expect(entity.entityData.email).equal(undefined);
    });

    it ('should not add default to optional properties', () => {
        schema = new Schema({
            name:{type:'string'},
            email:{optional:true}
        });
        let model = datastools.model('BlogPost', schema);

        let entity = new model({});

        expect(entity.entityData.email).equal(undefined);
    });

    it ('should its array of excludedFromIndexes', () => {
        schema = new Schema({
            name    : {excludedFromIndexes:true},
            lastname: {excludedFromIndexes:true}
        });
        let model = datastools.model('BlogPost', schema);

        let entity = new model({name:'John'});

        expect(entity.excludedFromIndexes).deep.equal(['name', 'lastname']);
    });

    it('should set entity Data modifiedOn to new Date if property in Schema', () => {
        schema = new Schema({modifiedOn: {type: 'datetime'}});
        var model  = datastools.model('BlogPost', schema);

        var entity = new model({}, 'keyid');

        expect(entity.entityData.modifiedOn).to.exist;
        expect(entity.entityData.modifiedOn.toString()).to.equal(new Date().toString());
    });

    describe('should create correct Datastore Key when instantiated', () => {
        beforeEach(() => {
            sinon.spy(ds, 'key');
        });

        afterEach(() => {
            ds.key.restore();
        });

        it('---> with a full Key (String keyname passed)', () => {
            var model  = datastools.model('BlogPost', schema);

            var entity = new model({}, 'keyid');

            expect(entity.entityKey.kind).equal('BlogPost');
            expect(entity.entityKey.name).equal('keyid');
        });

        it ('---> with a full Key (Integer keyname passed)', () => {
            var Model  = datastools.model('BlogPost', schema);

            var entity = new Model({}, '123');

            expect(entity.entityKey.id).equal(123);
        });

        it ('---> with a partial Key (auto-generated id)', () => {
            var Model  = datastools.model('BlogPost', schema);

            new Model({});

            expect(ds.key.getCall(0).args[0]).to.deep.equal('BlogPost');
        });

        it('---> with an ancestor path (auto-generated id)', () => {
            var Model  = datastools.model('BlogPost', schema);

            var entity = new Model({}, null, ['Parent', 1234]);

            expect(entity.entityKey.parent.kind).equal('Parent');
            expect(entity.entityKey.parent.id).equal(1234);
            expect(entity.entityKey.kind).equal('BlogPost');
        });

        it('---> with an ancestor path (manual id)', () => {
            var Model  = datastools.model('BlogPost', schema);

            var entity = new Model({}, 'entityName', ['Parent', 1234]);

            expect(entity.entityKey.parent.kind).equal('Parent');
            expect(entity.entityKey.parent.id).equal(1234);
            expect(entity.entityKey.kind).equal('BlogPost');
            expect(entity.entityKey.name).equal('entityName');
        });

        it('---> with a namespace', () => {
            let Model  = datastools.model('BlogPost', schema);

            let model = new Model({}, null, null, 'com.otherdomain');

            expect(model.entityKey.namespace).equal('com.otherdomain');
        });
    });

    describe('should register schema hooks', () => {
        let model;
        let entity;
        let spyOn;

        beforeEach(() => {
            spyOn = {
                fnHookPre: (next) => {next();},
                fnHookPost: () => {}
            };
        });

        it('should call pre hooks before saving', (done) => {
            var save = sinon.spy(spyOn, 'fnHookPre');
            schema.pre('save', save);
            model  = datastools.model('BlogPost', schema);
            entity = new model({name:'John'});

            entity.save(done);

            expect(save.callCount).to.equal(1);
            save.restore();
        });

        it('should call pre and post hooks on custom method', () => {
            var preNewMethod = sinon.spy(spyOn, 'fnHookPre');
            var postNewMethod = sinon.spy(spyOn, 'fnHookPost');
            schema.method('newmethod', function() {
                this.emit('newmethod');
                return true;
            });
            schema.pre('newmethod', preNewMethod);
            schema.post('newmethod', postNewMethod);
            model  = datastools.model('BlogPost', schema);
            entity = new model({name:'John'});

            entity.newmethod();

            expect(preNewMethod.callCount).to.equal(1);
            expect(postNewMethod.callCount).to.equal(1);
            preNewMethod.restore();
            postNewMethod.restore();
        });

        it('should call post hooks after saving', (done) => {
            let save = sinon.spy(spyOn, 'fnHookPost');
            schema.post('save', save);
            model  = datastools.model('BlogPost', schema);
            entity = new model({});

            entity.save(done);

            expect(save.calledOnce).to.be.true;
            save.restore();
        });
    });
});
