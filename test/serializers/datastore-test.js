var chai = require('chai');
var expect = chai.expect;

var gstore = require('../../');
var Schema     = require('../../lib').Schema;

var datastoreSerializer = require('../../lib/serializer').Datastore;

describe('Datastore serializer', () => {
    "use strict";

    var ModelInstance;

    beforeEach(function() {
        datastools.models       = {};
        datastools.modelSchemas = {};

        var schema = new Schema({
            name: {type: 'string'},
            email : {type:'string', read:false}
        });
        ModelInstance = datastools.model('Blog', schema, {});
    });

    describe('should convert data FROM Datastore format', function() {
        var datastoreMock;

        beforeEach(function() {
            datastoreMock = {
                key: {
                    namespace: undefined,
                    id: 1234,
                    kind: "BlogPost",
                    path: ["BlogPost", 1234]
                },
                data: {
                    name: "John",
                    lastname : 'Snow',
                    email : 'john@snow.com'
                }
            };
        })

        it('to simple object', () => {
            var serialized = datastoreSerializer.fromDatastore.call(ModelInstance, datastoreMock);

            expect(serialized).equal = datastoreMock.data;
            expect(serialized.id).equal(datastoreMock.key.id);
            expect(serialized.email).not.exist;
        });

        it('accepting "readAll" param', () => {
            var serialized = datastoreSerializer.fromDatastore.call(ModelInstance, datastoreMock, true);

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

