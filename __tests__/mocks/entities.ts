import datastoreFactory from './datastore';

const ds = datastoreFactory({
  namespace: 'com.mydomain',
});

const key1 = ds.key(['User', 111]);
const key2 = ds.key(['User', 222]);
const key3 = ds.key(['User', 333]);
const key4 = ds.key(['User', 444]);
const key5 = ds.key(['User', 555]);

const entity1: any = { name: 'John' };
const entity2: any = { name: 'Mick' };
const entity3: any = { name: 'Carol' };
const entity4: any = { name: 'Greg' };
const entity5: any = { name: 'Tito' };

entity1[ds.KEY] = key1;
entity2[ds.KEY] = key2;
entity3[ds.KEY] = key3;
entity4[ds.KEY] = key4;
entity5[ds.KEY] = key5;

// Helper to create fakeData on beforeEach
// to make sure we did not mutate any entity in our
// tests... We should not, but who knows?
const generateEntities = (): any => {
  const mockEntity: any = {
    name: 'John',
    lastname: 'Snow',
    email: 'john@snow.com',
  };

  mockEntity[ds.KEY] = ds.key(['BlogPost', 1234]);

  const mockEntity2: any = { name: 'John', lastname: 'Snow', password: 'xxx' };
  mockEntity2[ds.KEY] = ds.key(['BlogPost', 1234]);

  const mockEntity3: any = { name: 'Mick', lastname: 'Jagger' };
  mockEntity3[ds.KEY] = ds.key(['BlogPost', 'keyname']);

  const mockEntities = [mockEntity2, mockEntity3];

  return {
    mockEntity,
    mockEntity2,
    mockEntity3,
    mockEntities,
  };
};

export default {
  keys: [key1, key2, key3, key4, key5],
  entities: [entity1, entity2, entity3, entity4, entity5],
  generateEntities,
};
