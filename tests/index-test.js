var chai       = require('chai');
var expect     = chai.expect;
var datastools = require('../lib');

describe('Datastools', function() {
    "use strict";
    it('should initialized properties', function() {
        expect(datastools.models).to.exist;
        expect(datastools.modelSchemas).to.exist;
        expect(datastools.options).to.exist;
        expect(datastools.Schema).to.exist;
    });
});
