var chai = require('chai');
var expect = chai.expect;

var serializer = require('../../lib/services/serializer');

describe('Service Serializer', () => {
    "use strict";

    describe('Datastore', () => {
        describe ('should convert data to Datastore format', () => {
            it ('without passing non-indexed properties', () => {
                var expected = {
                    name:'name',
                    value:'John',
                    excludeFromIndexes:false
                };
                var serialized = serializer.ds.toDatastore({name:'John'});
                expect(serialized[0]).to.deep.equal(expected);
            });

            it ('not taking into account undefined variables', () => {
                var serialized = serializer.ds.toDatastore({name:'John', lastname:undefined});
                expect(serialized[0].lastname).to.not.exist;
            });

            it ('and set excludeFromIndexes', () => {
                var serialized = serializer.ds.toDatastore({name:'John'}, ['name']);
                expect(serialized[0].excludeFromIndexes).to.be.true;
            });
        });
    });
});
