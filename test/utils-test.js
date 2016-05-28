var chai   = require('chai');
var expect = chai.expect;
var utils  = require('../lib/utils');

describe('Utils', () => {
    "use strict";

    describe('should create shallow copy of default options', () => {
        it ('passing existing options', () => {
            var options = {sendMail:true};
            var defaultOptions = {modified:false};

            options = utils.options(defaultOptions, options);

            expect(options.modified).to.exist;
        });

        it ('not overriding an existing key', () => {
            var options = {modified:true};
            var defaultOptions = {modified:false};

            options = utils.options(defaultOptions, options);

            expect(options.modified).to.be.true;
        });

        it ('and create object if nothing is passed', () => {
            var defaultOptions = {modified:false};

            var options = utils.options(defaultOptions);

            expect(options.modified).to.exist;
        });
    });

    describe('should validate if an arg is an Object', () => {
        it ('passing an object', () => {
            var isObject = utils.isObject({});

            expect(isObject).to.be.true;
        });

        it ('passing a buffer', () => {
            var buffer = new Buffer(8);
            var isObject = utils.isObject(buffer);

            expect(isObject).to.be.true;
        });
    });
});
