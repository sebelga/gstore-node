'use strict';

const chai = require('chai');
const expect = chai.expect;

const gstore = require('../../lib');

const Schema = require('../../lib').Schema;
const datastoreSerializer = require('../../lib/serializer').Datastore;

describe('Datastore serializer', () => {

    var ModelInstance;

    beforeEach(function() {
        gstore.models       = {};
        gstore.modelSchemas = {};

        var schema = new Schema({
            name: {type: 'string'},
            email : {type:'string', read:false}
        });
        ModelInstance = gstore.model('Blog', schema, {});
    });

    describe('should convert data FROM Datastore format', function() {
        let datastoreMock;
        let legacyDatastoreMock;
        let entity;

        const key = {
            namespace: undefined,
            id: 1234,
            kind: "BlogPost",
            path: ["BlogPost", 1234]
        };

        let data;

        beforeEach(function() {
            data = {
                name: "John",
                lastname : 'Snow',
                email : 'john@snow.com'
            };

            datastoreMock = data;
            datastoreMock[ModelInstance.gstore.ds.KEY] = key;

            legacyDatastoreMock = {
                key: key,
                data: data
            };
        })

        it('for legacy datastore format (< 0.5.0)', () => {
            var serialized = datastoreSerializer.fromDatastore.call(ModelInstance, legacyDatastoreMock);
            
            expect(serialized.id).equal(legacyDatastoreMock.key.id);
            expect(serialized.email).not.exist;

            // Apart from the id (correctly added) and the email
            // (correctly removed from read:false) everything else should be the same
            delete legacyDatastoreMock.data.email;
            delete serialized.id;
            expect(serialized).deep.equal(legacyDatastoreMock.data);
        });

        it ('for new datastore format, adding Symbol("KEY") id to entity', () => {
            var serialized = datastoreSerializer.fromDatastore.call(ModelInstance, datastoreMock);

            //expect(serialized).equal = datastoreMock;
            expect(serialized.id).equal(key.id);
            expect(serialized.email).not.exist;
        });

        it('accepting "readAll" param', () => {
            var serialized = datastoreSerializer.fromDatastore.call(ModelInstance, datastoreMock, true);

            expect(serialized.email).exist;
        });
        
        it('accepting "readAll" param (legacy)', () => {
            var serialized = datastoreSerializer.fromDatastore.call(ModelInstance, legacyDatastoreMock, true);

            expect(serialized.email).exist;
        });
    });


    describe ('should convert data TO Datastore format', () => {
        it ('without passing non-indexed properties', () => {
            var expected = {
                name:'name',
                value:'John',
                excludeFromIndexes:false
            };
            var serialized = datastoreSerializer.toDatastore({name:'John'});
            expect(serialized[0]).to.deep.equal(expected);
        });

        it ('and not into account undefined variables', () => {
            var serialized = datastoreSerializer.toDatastore({name:'John', lastname:undefined});
            expect(serialized[0].lastname).to.not.exist;
        });

        it ('and set excludeFromIndexes properties', () => {
            var serialized = datastoreSerializer.toDatastore({name:'John'}, ['name']);
            expect(serialized[0].excludeFromIndexes).to.be.true;
        });
    });
});

