/* eslint-disable no-unused-expressions */

'use strict';

const chai = require('chai');
const sinon = require('sinon');
const Chance = require('chance');
const Joi = require('@hapi/joi');
const { Datastore } = require('@google-cloud/datastore');
const { argv } = require('yargs');

const { Gstore } = require('../../lib');
const Entity = require('../../lib/entity');

const gstore = new Gstore();
const chance = new Chance();

const ds = new Datastore({ projectId: 'gstore-integration-testsx' });
gstore.connect(ds);

const { expect, assert } = chai;
const { Schema } = gstore;

const allKeys = [];

/**
 * We save all saved key so we can delete them after our tests have ran
 */
const addKey = (key) => {
    allKeys.push(key);
};

const cleanUp = (cb) => {
    ds.delete(allKeys)
        .then(cb)
        .catch((err) => {
            console.log('Error cleaning up'); // eslint-disable-line
            console.log(err); // eslint-disable-line
            cb();
        });
};

const randomName = () => chance.string({ pool: 'abcdefghijklmnopqrstuvwxyz' });

describe('Model (Integration Tests)', () => {
    after(function afterAllIntTest(done) {
        if (argv.int !== true) {
            this.skip();
        }
        cleanUp(() => done());
    });

    beforeEach(function integrationTest() {
        if (argv.int !== true) {
            // Skip e2e tests suite
            this.skip();
        }
    });

    describe('get()', () => {
        const { Key } = Schema.Types;
        const companySchema = new Schema({ name: { type: String } });
        const userSchema = new Schema({
            name: { type: String },
            email: { type: String },
            company: { type: Key },
            private: { read: false },
        });
        const publicationSchema = new Schema({ title: { type: String }, user: { type: Key } });
        const postSchema = new Schema({
            title: { type: String },
            user: { type: Key },
            publication: { type: Key },
        });

        const UserModel = gstore.model('ModelTests-User', userSchema);
        const CompanyModel = gstore.model('ModelTests-Company', companySchema);
        const PostModel = gstore.model('ModelTests-Post', postSchema);
        const PublicationModel = gstore.model('ModelTests-Publication', publicationSchema);

        const addCompany = () => {
            const name = randomName();
            const company = new CompanyModel({ name });
            return company.save()
                .then(({ entityKey }) => {
                    addKey(entityKey);
                    return { name, entityKey };
                });
        };

        const addUser = (company = null) => {
            const name = randomName();
            const user = new UserModel({
                name, company, email: chance.email(), private: randomName(),
            });
            return user.save()
                .then(({ entityKey }) => {
                    addKey(entityKey);
                    return { name, entityKey };
                });
        };

        const addPost = (userKey = null, publicationKey = null) => {
            const title = randomName();
            const post = new PostModel({ title, user: userKey, publication: publicationKey });
            return post.save()
                .then(({ entityKey }) => {
                    addKey(entityKey);
                    return { title, entityKey };
                });
        };

        const addPublication = (userKey = null) => {
            const title = randomName();
            const publication = new PublicationModel({ title, user: userKey });
            return publication.save()
                .then(({ entityKey }) => {
                    addKey(entityKey);
                    return { title, entityKey };
                });
        };

        describe('populate()', () => {
            it('should fetch the "user" embedded entities', async () => {
                const { name: userName, entityKey: userKey } = await addUser();
                const { entityKey: postKey } = await addPost(userKey);

                try {
                    const { entityData } = await PostModel.get(postKey.id).populate('user');
                    expect(entityData.user.id).equal(userKey.id);
                    expect(entityData.user.name).equal(userName);
                    assert.isUndefined(entityData.user.private); // make sure "read: false" is not leaked
                } catch (err) {
                    throw (err);
                }
            });

            it('should return "null" if trying to populate a prop that does not exist', async () => {
                const { entityKey: postKey } = await addPost();

                try {
                    const { entityData } = await PostModel.get(postKey.id).populate('unknown');
                    expect(entityData.unknown).equal(null);
                } catch (err) {
                    throw (err);
                }
            });

            it('should populate multiple props', async () => {
                const { name: userName, entityKey: userKey } = await addUser();
                const { entityKey: postKey } = await addPost(userKey);

                try {
                    const { entityData } = await PostModel.get(postKey.id).populate(['user', 'publication', 'unknown']);
                    expect(entityData.user.name).equal(userName);
                    expect(entityData.publication).equal(null);
                    expect(entityData.unknown).equal(null);
                } catch (err) {
                    throw (err);
                }
            });

            it('should populate multiple props (2)', async () => {
                const { name: userName, entityKey: userKey } = await addUser();
                const { title: publicationTitle, entityKey: publicationKey } = await addPublication(userKey);
                const { entityKey: postKey } = await addPost(userKey, publicationKey);

                try {
                    const { entityData } = await PostModel.get(postKey.id).populate(['user', 'publication']);
                    expect(entityData.user.name).equal(userName);
                    expect(entityData.publication.title).equal(publicationTitle);
                } catch (err) {
                    throw (err);
                }
            });

            it('should populate multiple props by **chaining** populate() calls', async () => {
                const { name: userName, entityKey: userKey } = await addUser();
                const { title: publicationTitle, entityKey: publicationKey } = await addPublication(userKey);
                const { entityKey: postKey } = await addPost(userKey, publicationKey);

                try {
                    const { entityData } = await PostModel.get(postKey.id)
                        .populate('user')
                        .populate('publication');
                    expect(entityData.user.name).equal(userName);
                    expect(entityData.publication.title).equal(publicationTitle);
                } catch (err) {
                    throw (err);
                }
            });

            it('should allow to select the properties to retrieve', async () => {
                const { entityKey: userKey } = await addUser();
                const { entityKey: postKey } = await addPost(userKey);

                try {
                    const { entityData } = await PostModel.get(postKey.id).populate('user', ['email', 'private']);
                    assert.isDefined(entityData.user.email);
                    assert.isUndefined(entityData.user.name);
                    assert.isDefined(entityData.user.private); // force get private fields
                } catch (err) {
                    throw (err);
                }
            });

            it('should throw an error when providing multiple properties to populate + fields to select', async () => {
                const { entityKey: userKey } = await addUser();
                const { entityKey: postKey } = await addPost(userKey);

                try {
                    await PostModel.get(postKey.id).populate(['user', 'publication'], ['email', 'private']);
                    throw new Error('Shoud not get here.');
                } catch (err) {
                    expect(err.message).equal('Only 1 property can be populated when fields to select are provided');
                }
            });

            it('should populate multiple entities', async () => {
                const { name: userName1, entityKey: userKey1 } = await addUser();
                const { name: userName2, entityKey: userKey2 } = await addUser();
                const { entityKey: postKey1 } = await addPost(userKey1);
                const { entityKey: postKey2 } = await addPost(userKey2);

                try {
                    const [post1, post2] = await PostModel.get([postKey1.id, postKey2.id]).populate('user');
                    expect(post1.entityData.user.id).equal(userKey1.id);
                    expect(post1.entityData.user.name).equal(userName1);
                    expect(post2.entityData.user.id).equal(userKey2.id);
                    expect(post2.entityData.user.name).equal(userName2);
                } catch (err) {
                    throw (err);
                }
            });

            it('should allow nested embedded entities', async () => {
                const { name: companyName, entityKey: companyKey } = await addCompany();
                const { name: userName, entityKey: userKey } = await addUser(companyKey);
                const { title: publicationTitle, entityKey: publicationKey } = await addPublication(userKey);
                const { entityKey: postKey } = await addPost(userKey, publicationKey);

                try {
                    const { entityData } = await PostModel.get(postKey.id)
                        .populate(['user', 'user.company'])
                        .populate('publication')
                        .populate('publication.user')
                        .populate('publication.user.company')
                        .populate('path.that.does.not.exist');

                    expect(entityData.user.id).equal(userKey.id);
                    expect(entityData.user.name).equal(userName);
                    expect(entityData.user.company.name).equal(companyName);
                    expect(entityData.publication.title).equal(publicationTitle);
                    expect(entityData.user).deep.equal(entityData.publication.user);
                    expect(entityData.path.that.does.not.exist).equal(null);
                } catch (err) {
                    throw (err);
                }
            });

            it('should fetch all key references when no path is specified', async () => {
                const { name: userName, entityKey: userKey } = await addUser();
                const { entityKey: postKey } = await addPost(userKey);

                try {
                    const { entityData } = await PostModel.get(postKey.id).populate();
                    expect(entityData.user.name).equal(userName);
                    expect(entityData.publication).equal(null);
                    assert.isUndefined(entityData.user.private); // make sure "read: false" is not leaked
                } catch (err) {
                    throw (err);
                }
            });

            it('should fetch the keys inside a Transaction', async () => {
                const transaction = gstore.transaction();
                sinon.spy(transaction, 'get');

                const { name: userName, entityKey: userKey } = await addUser();
                const { entityKey: postKey } = await addPost(userKey);

                try {
                    await transaction.run();
                    const { entityData } = await PostModel.get(postKey.id, null, null, transaction).populate('user');
                    await transaction.commit();
                    expect(transaction.get.called).equal(true);
                    expect(transaction.get.callCount).equal(2);
                    expect(entityData.user.name).equal(userName);
                } catch (err) {
                    throw (err);
                }
            });
        });
    });

    describe('update()', () => {
        describe('transaction()', () => {
            it('should update entity inside a transaction', () => {
                const userSchema = new Schema({
                    name: { joi: Joi.string().required() },
                    lastname: { joi: Joi.string() },
                    password: { joi: Joi.string() },
                    coins: { joi: Joi.number().integer().min(0) },
                    email: { joi: Joi.string().email() },
                    createdAt: { joi: Joi.date() },
                    access_token: { joi: [Joi.string(), Joi.number()] },
                    birthyear: { joi: Joi.number().integer().min(1900).max(2013) },
                }, { joi: true });

                const User = gstore.model('ModelTestsTransaction-User', userSchema);

                function transferCoins(fromUser, toUser, amount) {
                    return new Promise((resolve, reject) => {
                        const transaction = gstore.transaction();
                        return transaction.run()
                            .then(async () => {
                                await User.update(fromUser.entityKey.id, {
                                    coins: fromUser.coins - amount,
                                }, null, null, transaction);

                                await User.update(toUser.entityKey.id, {
                                    coins: toUser.coins + amount,
                                }, null, null, transaction);

                                transaction.commit()
                                    .then(async () => {
                                        const [user1, user2] = await User.get([
                                            fromUser.entityKey.id,
                                            toUser.entityKey.id,
                                        ], null, null, null, { preserveOrder: true });
                                        expect(user1.name).equal('User1');
                                        expect(user1.coins).equal(0);
                                        expect(user2.name).equal('User2');
                                        expect(user2.coins).equal(1050);
                                        resolve();
                                    }).catch((err) => {
                                        reject(err);
                                    });
                            }).catch((err) => {
                                transaction.rollback();
                                reject(err);
                            });
                    });
                }

                const fromUser = new User({ name: 'User1', coins: 1000 });
                const toUser = new User({ name: 'User2', coins: 50 });

                return fromUser.save()
                    .then(({ entityKey }) => {
                        addKey(entityKey);
                        return toUser.save();
                    })
                    .then(({ entityKey }) => {
                        addKey(entityKey);
                        return transferCoins(fromUser, toUser, 1000);
                    });
            });
        });
    });


    describe('hooks', () => {
        it('post delete hook should set scope on entity instance', () => {
            const schema = new Schema({ name: { type: 'string' } });
            schema.post('delete', function postDelete({ key }) {
                expect(key.kind).equal('ModelTests-Hooks');
                expect(key.id).equal(123);
                expect(this instanceof Entity);
                expect(key).equal(this.entityKey);
                return Promise.resolve();
            });
            const Model = gstore.model('ModelTests-Hooks', schema);
            return Model.delete(123);
        });
    });
});
