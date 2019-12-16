import { Datastore } from '@google-cloud/datastore';
import arrify from 'arrify';
import is from 'is';

import { DocId, IdType, EntityKey, Ancestor } from 'gstore-node';

/**
 * As we can provide the ID of the document in multiple format, this method parse the id and return
 * the value. As the Datastor treats differently "id" (integer) from "name" (string),
 * @param id The entity or document id
 */
const getIdValue = (docId: DocId): { value: IdType; isId: boolean } => {
  const value = typeof docId === 'string' ? docId : (docId as { name: string }).name ?? (docId as { id: string }).id;
  const isId = typeof docId === 'object' && {}.hasOwnProperty.call(docId, 'id') === true;
  return {
    value,
    isId,
  };
};

type BuildKeyFunc = <U extends DocId | DocId[]>(options: {
  entityKind: string;
  ids?: U;
  ancestors?: Ancestor;
  namespace?: string;
  datastore: Datastore;
}) => U extends Array<DocId> ? EntityKey[] : EntityKey;

export const buildKey: BuildKeyFunc = ({ entityKind, ids, ancestors, namespace, datastore }) => {
  const keys: EntityKey[] = [];

  let isMultiple = false;

  const getPath = (id?: DocId | null): IdType[] => {
    let path: IdType[] = [entityKind];

    if (typeof id !== 'undefined' && id !== null) {
      const { value, isId } = getIdValue(id);
      path.push(isId ? +value : value);
    }

    if (ancestors && is.array(ancestors)) {
      path = ancestors.concat(path);
    }

    return path;
  };

  const getKey = (id?: DocId | null): EntityKey => {
    if ((id as { key: EntityKey })?.key) {
      const { key } = id as { key: EntityKey };
      if (!datastore.isKey(key)) {
        throw new Error('The key provided is not a Datastore Key');
      }
      return key;
    }

    const path = getPath(id);
    let key;

    if (typeof namespace !== 'undefined' && namespace !== null) {
      key = datastore.key({
        namespace,
        path,
      });
    } else {
      key = datastore.key(path);
    }
    return key;
  };

  if (typeof ids !== 'undefined' && ids !== null) {
    const idsArray = arrify(ids);

    isMultiple = idsArray.length > 1;

    idsArray.forEach(id => {
      const key = getKey(id);
      keys.push(key);
    });
  } else {
    const key = getKey(null);
    keys.push(key);
  }

  return isMultiple ? (keys as any) : (keys[0] as any);
};
