import { Datastore } from '@google-cloud/datastore';
import { GstoreAdapter, DocId, EntityKey, Ancestor } from 'gstore-node';

import { buildKey } from './helpers';

export class DatastoreAdatper implements GstoreAdapter {
  private ds: Datastore;

  constructor(client: Datastore) {
    this.ds = client;
  }

  buildKey(options: { type: string; id: DocId; ancestors?: Ancestor; namespace?: string }): EntityKey {
    return buildKey({
      datastore: this.ds,
      entityKind: options.type,
      ancestors: options.ancestors,
      ids: options.id,
      namespace: options.namespace,
    });
  }

  get(id: DocId): void {
    console.log(this, id);
  }
}
