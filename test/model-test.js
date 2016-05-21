var chai = require('chai');
var expect = chai.expect;

var Model = require('../lib/model');
var Schema = require('../lib').Schema;

describe('Model', () => {
    "use strict";


    // it ('should create a model instance', () => {
    //     var schema = new Schema({keyname:{type:'string'}});
    //     var ds = {};
    //
    //     var model = Model.compile('Blog', schema, ds);
    //
    //     expect(model).to.exist;
    // });

    it ('==> Model Instance should have an init function', () => {
        var schema = new Schema({});
        var ds = {};

        var ModelInstance = Model.compile('Blog', schema, ds);
        var fn = () => {
            ModelInstance.init();
        };

        expect(fn).to.not.throw(Error);
    });

    it ('should apply schema methods to the constructor', () => {
        var schema = new Schema({});

        schema.method('doSomething', () => {});
        var ds = {};

        var ModelInstance = Model.compile('Blog', schema, ds);
        var model = new ModelInstance({}, 'keyid');
        expect(model.constructor.doSomething).equal(schema.methods.doSomething);
    });

});
