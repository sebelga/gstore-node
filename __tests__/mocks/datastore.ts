import { Datastore as GoogleDatastore } from '@google-cloud/datastore';

class Datastore {
  public googleDatastore: GoogleDatastore;

  constructor(options?: any) {
    this.googleDatastore = new GoogleDatastore(options);
  }

  key(options: any): any {
    return this.googleDatastore.key(options);
  }

  isKey(key: any): any {
    return this.googleDatastore.isKey(key);
  }

  save(): any {
    return Promise.resolve(this);
  }

  get(): any {
    return Promise.resolve(this);
  }

  delete(): any {
    return Promise.resolve(this);
  }

  createQuery(...args: any): any {
    return this.googleDatastore.createQuery(...args);
  }

  runQuery(): any {
    return Promise.resolve([[], { moreResults: 'MORE_RESULT', __ref: this }]);
  }

  transaction(): any {
    return { __ref: this };
  }

  int(value: any): any {
    return this.googleDatastore.int(value);
  }

  double(value: any): any {
    return this.googleDatastore.double(value);
  }

  geoPoint(value: any): any {
    return this.googleDatastore.geoPoint(value);
  }

  get MORE_RESULTS_AFTER_LIMIT(): any {
    return this.googleDatastore.MORE_RESULTS_AFTER_LIMIT;
  }

  get MORE_RESULTS_AFTER_CURSOR(): any {
    return this.googleDatastore.MORE_RESULTS_AFTER_CURSOR;
  }

  get NO_MORE_RESULTS(): any {
    return this.googleDatastore.NO_MORE_RESULTS;
  }

  get KEY(): any {
    return this.googleDatastore.KEY;
  }
}

export default (options?: any): any => new Datastore(options);
