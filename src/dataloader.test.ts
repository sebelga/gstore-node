import { Datastore } from '@google-cloud/datastore';
import chai from 'chai';
import sinon from 'sinon';

import { Gstore } from './index';
import { createDataLoader } from './dataloader';

const gstore = new Gstore();

const { expect, assert } = chai;
const ds = new Datastore();

describe('dataloader', () => {
  test('should read the ds instance from gstore', () => {
    gstore.connect(ds);
    const loader = gstore.createDataLoader();
    assert.isDefined(loader);
  });

  test('should create a dataloader instance', () => {
    const loader = createDataLoader(ds);
    expect(loader.constructor.name).equal('DataLoader');
    expect((loader as any)._options.maxBatchSize).equal(1000);
  });

  test('should pass the keys to the datastore "get" method and preserve Order', () => {
    const key1 = ds.key(['User', 123]);
    const key2 = ds.key(['User', 456]);
    const key3 = ds.key({
      namespace: 'ns-test',
      path: ['User', 789],
    });

    const entity1: any = { name: 'John 1' };
    const entity2: any = { name: 'John 2' };
    const entity3: any = { name: 'John 3' };

    entity1[ds.KEY] = key1;
    entity2[ds.KEY] = key2;
    entity3[ds.KEY] = key3;

    sinon.stub(ds, 'get').resolves([[entity3, entity2, entity1]]);

    const loader = createDataLoader(ds);

    return Promise.all([loader.load(key1), loader.load(key2), loader.load(key3)]).then(res => {
      expect(res[0][ds.KEY as any].id).equal(123);
      expect(res[1][ds.KEY as any].id).equal(456);
      expect(res[2][ds.KEY as any].id).equal(789);
    });
  });

  test('should return "null" for entities not found', () => {
    const key1 = ds.key(['User', 123]);
    const key2 = ds.key(['User', 456]);
    const key3 = ds.key(['User', 789]);
    const entity: any = { name: 'John' };
    entity[ds.KEY as any] = key2;

    (ds.get as any).resolves([[entity]]);

    const loader = createDataLoader(ds);

    return Promise.all([loader.load(key1), loader.load(key2), loader.load(key3)]).then(res => {
      expect(res[0]).equal(null);
      expect(res[1][ds.KEY as any].id).equal(456);
      expect(res[2]).equal(null);
    });
  });

  test('should bypass sort if only 1 key', () => {
    const entity: any = { name: 'John' };
    const key = ds.key(['User', 123]);
    entity[ds.KEY] = key;
    (ds.get as any).resolves([[entity]]);

    const loader = createDataLoader(ds);

    return loader.load(key).then(res => {
      expect(res[ds.KEY as any].id).equal(123);
    });
  });
});
