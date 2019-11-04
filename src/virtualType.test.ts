import chai from 'chai';
import VirtualType from './virtualType';

const { expect } = chai;

describe('VirtualType', () => {
  test('should add function to getter array', () => {
    const virtualType = new VirtualType('fullname');

    virtualType.get(() => {});

    expect(virtualType.getter).not.equal(null);
  });

  test('should throw error if not passing a function', () => {
    const virtualType = new VirtualType('fullname');

    const fn = (): void => {
      // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
      // @ts-ignore
      virtualType.get('string');
    };

    expect(fn).throw(Error);
  });

  test('should add function to setter array', () => {
    const virtualType = new VirtualType('fullname');

    virtualType.set(() => {});

    expect(virtualType.setter).not.equal(null);
  });

  test('should throw error if not passing a function', () => {
    const virtualType = new VirtualType('fullname');

    const fn = (): void => {
      // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
      // @ts-ignore
      virtualType.set('string');
    };

    expect(fn).throw(Error);
  });

  test('should applyGetter with scope', () => {
    const virtualType = new VirtualType('fullname');

    virtualType.get(function getName(this: any) {
      return `${this.name} ${this.lastname}`;
    });

    const entityData: any = {
      name: 'John',
      lastname: 'Snow',
    };

    virtualType.applyGetters(entityData);
    expect(entityData.fullname).equal('John Snow');
  });

  test('should return null if no getter', () => {
    const virtualType = new VirtualType('fullname');

    const entityData = {};

    const v = virtualType.applyGetters(entityData);
    expect(v).equal(null);
  });

  test('should applySetter with scope', () => {
    const virtualType = new VirtualType('fullname');

    virtualType.set(function setName(this: any, name) {
      const split = name.split(' ');
      [this.firstname, this.lastname] = split;
    });

    const entityData: any = {};

    virtualType.applySetters('John Snow', entityData);
    expect(entityData.firstname).equal('John');
    expect(entityData.lastname).equal('Snow');
  });

  test('should not do anything if no setter', () => {
    const virtualType = new VirtualType('fullname');

    const entityData = {};

    virtualType.applySetters('John Snow', entityData);
    expect(Object.keys(entityData).length).equal(0);
  });
});
