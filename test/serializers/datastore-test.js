var chai = require('chai');
var expect = chai.expect;

var datastoreSerializer = require('../../lib/serializer').Datastore;

describe('Datastore serializer', () => {
    "use strict";

    describe ('should convert data to Datastore format', () => {
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

