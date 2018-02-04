'use strict';

const ds = require('./datastore')({
    namespace: 'com.mydomain',
});

const key1 = ds.key(['User', 111]);
const key2 = ds.key(['User', 222]);
const key3 = ds.key(['User', 333]);
const key4 = ds.key(['User', 444]);
const key5 = ds.key(['User', 555]);

const entity1 = { name: 'John' };
const entity2 = { name: 'Mick' };
const entity3 = { name: 'Carol' };
const entity4 = { name: 'Greg' };
const entity5 = { name: 'Tito' };

entity1[ds.KEY] = key1;
entity2[ds.KEY] = key2;
entity3[ds.KEY] = key3;
entity4[ds.KEY] = key4;
entity5[ds.KEY] = key5;

module.exports = {
    keys: [key1, key2, key3, key4, key5],
    entities: [entity1, entity2, entity3, entity4, entity5],
};
