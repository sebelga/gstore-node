'use strict';

var chai   = require('chai');
var expect = chai.expect;
var sinon  = require('sinon');

var VirtualType = require('../lib/virtualType');

describe('VirtualType', function() {
    it('should add function to getter array', () => {
        var virtualType = new VirtualType('fullname');

        virtualType.get(() => {});

        expect(virtualType.getter).not.be.null;
    });

    it('should throw error if not passing a function', () => {
        var virtualType = new VirtualType('fullname');

        let fn = () => {
            virtualType.get('string');
        }

        expect(fn).throw(Error);
    });

    it('should add function to setter array', () => {
        var virtualType = new VirtualType('fullname');

        virtualType.set(() => {});

        expect(virtualType.setter).not.be.null;
    });

    it('should throw error if not passing a function', () => {
        var virtualType = new VirtualType('fullname');

        let fn = () => {
            virtualType.set('string');
        }

        expect(fn).throw(Error);
    });

    it('should applyGetter with scope', () => {
        var virtualType = new VirtualType('fullname');

        virtualType.get(function() {
            return this.name + ' ' + this.lastname;
        });

        var entityData = {
            name: 'John',
            lastname : 'Snow'
        };

        virtualType.applyGetters(entityData);
        expect(entityData.fullname).equal('John Snow');
    });

    it('should return null if no getter', () => {
        var virtualType = new VirtualType('fullname');

        var entityData = {};

        let v = virtualType.applyGetters(entityData);
        expect(v).be.null;
    });

    it('should applySetter with scope', () => {
        var virtualType = new VirtualType('fullname');

        virtualType.set(function(name) {
            let split      = name.split(' ');
            this.firstname = split[0];
            this.lastname  = split[1];
        });

        var entityData = {};

        virtualType.applySetters('John Snow', entityData);
        expect(entityData.firstname).equal('John');
        expect(entityData.lastname).equal('Snow');
    });

    it('should not do anything if no setter', () => {
        var virtualType = new VirtualType('fullname');

        var entityData = {};

        virtualType.applySetters('John Snow', entityData);
        expect(Object.keys(entityData).length).equal(0);
    });
});