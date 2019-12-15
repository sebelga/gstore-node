import { Datastore } from '@google-cloud/datastore';
import { buildKey } from './helpers';

const datastore = new Datastore();

describe('helpers', () => {
  describe('buildKey()', () => {
    test('should create a Datastore Key', () => {
      const key = buildKey({
        entityKind: 'Hello',
        ids: 'someName',
        namespace: 'my.namespace',
        datastore,
      });

      expect(datastore.isKey(key)).toBe(true);
      expect(key.path).toEqual(['Hello', 'someName']);
      expect(key.namespace).toEqual('my.namespace');
    });
  });
});
