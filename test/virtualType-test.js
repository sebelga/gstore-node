'use strict';

const chai = require('chai');
const { default: VirtualType } = require('../lib/virtualType');

const { expect } = chai;

describe('VirtualType', () => {
  it('should add function to getter array', () => {
    const virtualType = new VirtualType('fullname');

    virtualType.get(() => {});

    expect(virtualType.getter).not.equal(null);
  });

  it('should throw error if not passing a function', () => {
    const virtualType = new VirtualType('fullname');

    const fn = () => {
      virtualType.get('string');
    };

    expect(fn).throw(Error);
  });

  it('should add function to setter array', () => {
    const virtualType = new VirtualType('fullname');

    virtualType.set(() => {});

    expect(virtualType.setter).not.equal(null);
  });

  it('should throw error if not passing a function', () => {
    const virtualType = new VirtualType('fullname');

    const fn = () => {
      virtualType.set('string');
    };

    expect(fn).throw(Error);
  });

  it('should applyGetter with scope', () => {
    const virtualType = new VirtualType('fullname');

    virtualType.get(function getName() {
      return `${this.name} ${this.lastname}`;
    });

    const entityData = {
      name: 'John',
      lastname: 'Snow',
    };

    virtualType.applyGetters(entityData);
    expect(entityData.fullname).equal('John Snow');
  });

  it('should return null if no getter', () => {
    const virtualType = new VirtualType('fullname');

    const entityData = {};

    const v = virtualType.applyGetters(entityData);
    expect(v).equal(null);
  });

  it('should applySetter with scope', () => {
    const virtualType = new VirtualType('fullname');

    virtualType.set(function setName(name) {
      const split = name.split(' ');
      [this.firstname, this.lastname] = split;
    });

    const entityData = {};

    virtualType.applySetters('John Snow', entityData);
    expect(entityData.firstname).equal('John');
    expect(entityData.lastname).equal('Snow');
  });

  it('should not do anything if no setter', () => {
    const virtualType = new VirtualType('fullname');

    const entityData = {};

    virtualType.applySetters('John Snow', entityData);
    expect(Object.keys(entityData).length).equal(0);
  });
});
