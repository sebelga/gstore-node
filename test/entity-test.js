/*jshint -W030 */
var chai   = require('chai');
var expect = chai.expect;
var sinon  = require('sinon');

var nconf = require('nconf');
nconf.file({ file: './test/config.json' });

var gcloud = require('gcloud')(nconf.get('gcloud'));
var ds     = gcloud.datastore(nconf.get('gcloud-datastore'));

var datastools = require('../lib');
datastools.connect(ds);

var Schema     = require('../lib').Schema;

var schema;

describe('Entity', () => {
    "use strict";

    beforeEach(() => {
        schema = new Schema({name:{type:'string'}});
    });

    afterEach(() => {
        datastools.models       = {};
        datastools.modelSchemas = {};
        datastools.options      = {};
    });

    it('should initialized properties', (done) => {
        var model  = datastools.model('BlogPost', schema);

        var entity = new model({}, 'keyid');

        expect(entity.entityData).to.exist;
        expect(entity.entityKey).to.exist;
        expect(entity.schema).to.exist;
        expect(entity.pre).to.exist;
        expect(entity.post).to.exist;

        done();
    });

    it ('should add data passed to entityData', () => {
        var model  = datastools.model('BlogPost', schema);

        var entity = new model({name:'John'}, 'keyid');

        expect(entity.entityData.name).to.equal('John');
    });

    it ('should not add any data if nothing is passed', () => {
        var model  = datastools.model('BlogPost', schema);

        var entity = new model();

        expect(Object.keys(entity.entityData).length).to.equal(0);
    });

    it ('should set entity Data modifiedOn to new Date if property in Schema', () => {
        schema = new Schema({modifiedOn: {type: 'datetime'}});
        var model  = datastools.model('BlogPost', schema);

        var entity = new model({}, 'keyid');

        expect(entity.entityData.modifiedOn).to.exist;
        expect(entity.entityData.modifiedOn.toString()).to.equal(new Date().toString());
    });

    describe('should create Datastore Key when intantiated with', () => {
        beforeEach(() => {
            sinon.stub(ds, 'key', () => {
                return {};
            });
        });

        afterEach(() => {
            ds.key.restore();
        });

        it ('---> full Key (keyname passed) {string}', () => {
            var model  = datastools.model('BlogPost', schema);

            var entity = new model({}, 'keyid');

            expect(ds.key.getCall(0).args[0]).to.deep.equal(['BlogPost', 'keyid']);
        });

        it ('---> full Key (keyname passed) {int}', () => {
            var model  = datastools.model('BlogPost', schema);

            var entity = new model({}, '123');

            expect(ds.key.getCall(0).args[0]).to.deep.equal(['BlogPost', 123]);
        });

        it ('---> partial Key (auto-generated id)', () => {
            var model  = datastools.model('BlogPost', schema);

            new model({});

            expect(ds.key.getCall(0).args[0]).to.deep.equal('BlogPost');
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

        it('should call pre hooks before saving', () => {
            var save = sinon.spy(spyOn, 'fnHookPre');
            schema.pre('save', save);
            model  = datastools.model('BlogPost', schema);
            entity = new model({name:'John'});

            entity.save();

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

        it('should call post hooks after saving', () => {
            let save = sinon.spy(spyOn, 'fnHookPost');
            schema.post('save', save);
            model  = datastools.model('BlogPost', schema);
            entity = new model({});

            entity.save();

            expect(save.calledOnce).to.be.true;
            save.restore();
        });
    });
});
