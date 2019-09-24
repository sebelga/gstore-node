/* eslint-disable no-unused-expressions */

'use strict';

const chai = require('chai');
const sinon = require('sinon');
const Chance = require('chance');
const Joi = require('@hapi/joi');
const { Datastore } = require('@google-cloud/datastore');

const { Gstore } = require('../lib');
const Entity = require('../lib/entity');

const gstore = new Gstore();
const chance = new Chance();

const ds = new Datastore({
  projectId: 'gstore-integration-tests',
  keyFilename: '/Users/sebastien/secure-keys/gstore-integration-tests-67ddd52037cf.json',
});
gstore.connect(ds);

const { expect, assert } = chai;
const { Schema } = gstore;

const allKeys = [];

/**
 * We save all saved key so we can delete them after our tests have ran
 */
const addKey = key => {
  allKeys.push(key);
};

const cleanUp = cb => {
  ds.delete(allKeys)
    .then(cb)
    .catch(err => {
            console.log('Error cleaning up'); // eslint-disable-line
            console.log(err); // eslint-disable-line
      cb();
    });
};

const randomName = () => chance.string({ pool: 'abcdefghijklmnopqrstuvwxyz0123456789' });

describe('Model (Integration Tests)', () => {
  after(done => {
    cleanUp(() => done());
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
      }, randomName());
      return user.save()
        .then(({ entityKey }) => {
          addKey(entityKey);
          return { name, entityKey };
        });
    };

    const addPost = (userKey = null, publicationKey = null) => {
      const title = randomName();
      const post = new PostModel({ title, user: userKey, publication: publicationKey }, randomName());
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

        const { entityData } = await PostModel.get(postKey.name).populate('user');
        expect(entityData.user.id).equal(userKey.name);
        expect(entityData.user.name).equal(userName);
        assert.isUndefined(entityData.user.private); // make sure "read: false" is not leaked
      });

      it('should return "null" if trying to populate a prop that does not exist', async () => {
        const { entityKey: postKey } = await addPost();

        const { entityData } = await PostModel.get(postKey.name).populate('unknown');
        expect(entityData.unknown).equal(null);
      });

      it('should populate multiple props', async () => {
        const { name: userName, entityKey: userKey } = await addUser();
        const { entityKey: postKey } = await addPost(userKey);

        const { entityData } = await PostModel.get(postKey.name).populate(['user', 'publication', 'unknown']);
        expect(entityData.user.name).equal(userName);
        expect(entityData.publication).equal(null);
        expect(entityData.unknown).equal(null);
      });

      it('should populate multiple props (2)', async () => {
        const { name: userName, entityKey: userKey } = await addUser();
        const { title: publicationTitle, entityKey: publicationKey } = await addPublication(userKey);
        const { entityKey: postKey } = await addPost(userKey, publicationKey);

        const { entityData } = await PostModel.get(postKey.name).populate(['user', 'publication']);
        expect(entityData.user.name).equal(userName);
        expect(entityData.publication.title).equal(publicationTitle);
      });

      it('should populate multiple props by **chaining** populate() calls', async () => {
        const { name: userName, entityKey: userKey } = await addUser();
        const { title: publicationTitle, entityKey: publicationKey } = await addPublication(userKey);
        const { entityKey: postKey } = await addPost(userKey, publicationKey);

        const { entityData } = await PostModel.get(postKey.name)
          .populate('user')
          .populate('publication');
        expect(entityData.user.name).equal(userName);
        expect(entityData.publication.title).equal(publicationTitle);
      });

      it('should allow to select the properties to retrieve', async () => {
        const { entityKey: userKey } = await addUser();
        const { entityKey: postKey } = await addPost(userKey);

        const { entityData } = await PostModel.get(postKey.name).populate('user', ['email', 'private']);
        assert.isDefined(entityData.user.email);
        assert.isUndefined(entityData.user.name);
        assert.isDefined(entityData.user.private); // force get private fields
      });

      it('should throw an error when providing multiple properties to populate + fields to select', async () => {
        const { entityKey: userKey } = await addUser();
        const { entityKey: postKey } = await addPost(userKey);

        try {
          await PostModel.get(postKey.name).populate(['user', 'publication'], ['email', 'private']);
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

        const [post1, post2] = await PostModel.get([postKey1.name, postKey2.name]).populate('user');
        expect(post1.entityData.user.id).equal(userKey1.name);
        expect(post1.entityData.user.name).equal(userName1);
        expect(post2.entityData.user.id).equal(userKey2.name);
        expect(post2.entityData.user.name).equal(userName2);
      });

      it('should allow nested embedded entities', async () => {
        const { name: companyName, entityKey: companyKey } = await addCompany();
        const { name: userName, entityKey: userKey } = await addUser(companyKey);
        const { title: publicationTitle, entityKey: publicationKey } = await addPublication(userKey);
        const { entityKey: postKey } = await addPost(userKey, publicationKey);

        const { entityData } = await PostModel.get(postKey.name)
          .populate(['user', 'user.company'])
          .populate('publication')
          .populate('publication.user')
          .populate('publication.user.company')
          .populate('path.that.does.not.exist');

        expect(entityData.user.id).equal(userKey.name);
        expect(entityData.user.name).equal(userName);
        expect(entityData.user.company.name).equal(companyName);
        expect(entityData.publication.title).equal(publicationTitle);
        expect(entityData.user).deep.equal(entityData.publication.user);
        expect(entityData.path.that.does.not.exist).equal(null);
      });

      it('should fetch all key references when no path is specified', async () => {
        const { name: userName, entityKey: userKey } = await addUser();
        const { entityKey: postKey } = await addPost(userKey);

        const { entityData } = await PostModel.get(postKey.name).populate();
        expect(entityData.user.name).equal(userName);
        expect(entityData.publication).equal(null);
        assert.isUndefined(entityData.user.private); // make sure "read: false" is not leaked
      });

      it('should fetch the keys inside a Transaction', async () => {
        const transaction = gstore.transaction();
        sinon.spy(transaction, 'get');

        const { name: userName, entityKey: userKey } = await addUser();
        const { entityKey: postKey } = await addPost(userKey);

        await transaction.run();
        const { entityData } = await PostModel.get(postKey.name, null, null, transaction).populate('user');
        await transaction.commit();
        expect(transaction.get.called).equal(true);
        expect(transaction.get.callCount).equal(2);
        expect(entityData.user.name).equal(userName);
      });
    });
  });

  describe('update()', () => {
    describe('transaction()', () => {
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

      it('should update entity inside a transaction', () => {
        function transferCoins(fromUser, toUser, amount) {
          return new Promise((resolve, reject) => {
            const transaction = gstore.transaction();
            return transaction.run()
              .then(async () => {
                await User.update(fromUser.entityKey.name, {
                  coins: fromUser.coins - amount,
                }, null, null, transaction);

                await User.update(toUser.entityKey.name, {
                  coins: toUser.coins + amount,
                }, null, null, transaction);

                transaction.commit()
                  .then(async () => {
                    const [user1, user2] = await User.get([
                      fromUser.entityKey.name,
                      toUser.entityKey.name,
                    ], null, null, null, { preserveOrder: true });
                    expect(user1.name).equal('User1');
                    expect(user1.coins).equal(0);
                    expect(user2.name).equal('User2');
                    expect(user2.coins).equal(1050);
                    resolve();
                  }).catch(err => {
                    reject(err);
                  });
              }).catch(err => {
                transaction.rollback();
                reject(err);
              });
          });
        }

        const fromUser = new User({ name: 'User1', coins: 1000 }, randomName());
        const toUser = new User({ name: 'User2', coins: 50 }, randomName());

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

      it('should throw a 404 Not found when trying to update a non existing entity', done => {
        User.update(randomName(), { name: 'test' })
          .catch(err => {
            expect(err.code).equal('ERR_ENTITY_NOT_FOUND');
            done();
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
        expect(this instanceof Entity.default);
        expect(key).equal(this.entityKey);
        return Promise.resolve();
      });
      const Model = gstore.model('ModelTests-Hooks', schema);
      return Model.delete(123);
    });
  });
});
