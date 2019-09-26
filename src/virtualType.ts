import is from 'is';

import { FunctionType, GenericObject } from './types';

class VirtualType {
  public readonly name: string;

  public getter: FunctionType | null;

  public setter: FunctionType | null;

  public options: GenericObject;

  constructor(name: string, options?: GenericObject) {
    this.name = name;
    this.getter = null;
    this.setter = null;
    this.options = options || {};
  }

  get(fn: FunctionType): VirtualType {
    if (!is.fn(fn)) {
      throw new Error('You need to pass a function to virtual get');
    }
    this.getter = fn;
    return this;
  }

  set(fn: FunctionType): VirtualType {
    if (!is.fn(fn)) {
      throw new Error('You need to pass a function to virtual set');
    }
    this.setter = fn;
    return this;
  }

  applyGetters(scope: any): unknown {
    if (this.getter === null) {
      return null;
    }
    const v = this.getter.call(scope);
    scope[this.name] = v;
    return v;
  }

  applySetters(value: unknown, scope: any): unknown {
    if (this.setter === null) {
      return null;
    }
    const v = this.setter.call(scope, value);
    return v;
  }
}

export default VirtualType;
