var chai       = require('chai');
var expect     = chai.expect;

var datastools = require('../lib');
var Schema     = require('../lib').Schema;
var Entity     = require('../lib/entity');
var Model      = require('../lib');

describe('Schema', () => {
    "use strict";

    beforeEach(function() {

    });

    describe('contructor', () => {
        it('should initialized properties', () => {
            var schema = new Schema({});

            expect(schema.methods).to.exist;
            expect(schema.defaultQueries).to.exist;
            expect(schema.paths).to.exist;
            expect(schema.callQueue).to.exist;
            expect(schema.options).to.exist;
            expect(schema.s).to.exist;
        });

        // it ('should have a default middelware "save" added to queue', () => {
        //     var schema = new Schema({});
        //
        //     expect(schema.callQueue.length).gt(0);
        //     expect(schema.callQueue[0][0]).equal('pre');
        //     expect(schema.callQueue[0][1][0]).equal('save');
        //     expect(typeof schema.callQueue[0][1][2]).equal('function');
        // });

        // it ('should validate on pre save', () => {
        //     var schema = new Schema({});
        //     var Model = datastools.model('Blog', schema);
        //     // console.log('model:', Model);
        //     var modelInstance = new Model({});
        //     //modelInstance.constructor;
        //     //console.log(schema.callQueue[0][1][2]);
        //
        //     var fn = schema.callQueue[0][1][2];
        //     fn.bind(modelInstance);
        //     fn.call(modelInstance, () => {}, {test:123});
        //     // schema.callQueue[0][1][2](() => {}, {test:123});
        // });

        it ('should merge options passed', () => {
            var schema = new Schema({}, {optionName:'passed'});

            expect(schema.options.optionName).equal('passed');
        });

        it ('should create path with obj passed', () => {
            var schema = new Schema({prop1:{type:'string'}, prop2:{type:'number'}});

            expect(schema.paths.prop1).exists;
            expect(schema.paths.prop2).exists;
        });
    });

});
