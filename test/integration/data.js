'use strict';

const Datastore = require('@google-cloud/datastore');

const ds = new Datastore({ projectId: 'gstore-cache-integration-tests' });

const k1 = ds.key(['Parent', 'default', 'User', 111]);
const k2 = ds.key(['Parent', 'default', 'User', 222]);
const k3 = ds.key(['Blog', 'default', 'Post', 111]);
const k4 = ds.key(['Blog', 'default', 'Post', 222]);
const user1 = { name: 'john', age: 20 };
const user2 = { name: 'mick', age: 20 };
const post1 = { title: 'Hello', category: 'tech' };
const post2 = { title: 'World', category: 'tech' };

const query = ds
    .createQuery('User')
    .filter('age', 20)
    .hasAncestor(ds.key(['Parent', 'default']));

const query2 = ds
    .createQuery('Post')
    .filter('category', 'tech')
    .hasAncestor(ds.key(['Blog', 'default']));

module.exports = {
    k1,
    k2,
    k3,
    k4,
    user1,
    user2,
    post1,
    post2,
    query,
    query2,
};
