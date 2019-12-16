/* eslint-disable no-unused-expressions */

import chai from 'chai';
import sinon from 'sinon';
import Chance from 'chance';
import Joi from '@hapi/joi';
import { Datastore } from '@google-cloud/datastore';

import { Gstore, /* Entity */ EntityKey } from '../../packages/gstore-node/src';
import GstoreEntity from '../../packages/gstore-node/src/entity';
import { DatastoreAdatper } from '../../packages/gstore-datastore-adapter/src';

const ds = new Datastore({
  projectId: 'gstore-integration-tests',
  keyFilename: '/Users/sebastien/secure-keys/gstore-integration-tests-67ddd52037cf.json',
});

const gstore = new Gstore({ adapter: new DatastoreAdatper(ds) });
const chance = new Chance();

gstore.connect(ds);

const { expect, assert } = chai;
const { Schema } = gstore;

const allKeys: EntityKey[] = [];

/**
 * We save all saved key so we can delete them after our tests have ran
 */
const addKey = (key: EntityKey): void => {
  allKeys.push(key);
};

const cleanUp = (cb: any): Promise<any> => {
  return ((ds.delete(allKeys) as unknown) as Promise<any>)
    .then(() => {
      cb();
    })
    .catch(err => {
            console.log('Error cleaning up'); // eslint-disable-line
            console.log(err); // eslint-disable-line
    });
};

const randomName = (): string => chance.string({ pool: 'abcdefghijklmnopqrstuvwxyz0123456789' });

const { Key } = Schema.Types;
const companySchema = new Schema({ name: { type: String } });

const userSchema = new Schema({
  name: { type: String },
  email: { type: String },
  company: { type: Key },
  privateVal: { read: false },
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

const addCompany = (): Promise<{ name: string; entityKey: EntityKey }> => {
  const name = randomName();
  const company = new CompanyModel({ name });
  return company.save().then(({ entityKey }) => {
    addKey(entityKey);
    return { name, entityKey };
  });
};

const addUser = (company: EntityKey | null = null): Promise<any> => {
  const name = randomName();
  const email = chance.email();
  const privateVal = randomName();

  const user = new UserModel(
    {
      name,
      company,
      email,
      privateVal,
    },
    randomName(),
  );
  return user.save().then(({ entityKey }) => {
    addKey(entityKey);
    return { entityKey, name, email, company, privateVal };
  });
};

const addPost = (userKey = null, publicationKey = null): Promise<any> => {
  const title = randomName();
  const post = new PostModel({ title, user: userKey, publication: publicationKey }, randomName());
  return post.save().then(({ entityKey }) => {
    addKey(entityKey);
    return { title, entityKey };
  });
};

const addPublication = (userKey = null): Promise<any> => {
  const title = randomName();
  const publication = new PublicationModel({ title, user: userKey });
  return publication.save().then(({ entityKey }) => {
    addKey(entityKey);
    return { title, entityKey };
  });
};

describe('Model (Integration Tests)', () => {
  afterAll(done => {
    cleanUp(() => done());
  });

  describe('get()', () => {
    describe('populate()', () => {
      test('should fetch the "user" embedded entities', async () => {
        const { name: userName, entityKey: userKey } = await addUser();
        const { entityKey: postKey } = await addPost(userKey);

        const { entityData } = await PostModel.get(postKey.name as string).populate('user');
        expect((entityData.user as any).id).equal(userKey.name);
        expect((entityData.user as any).name).equal(userName);
        assert.isUndefined((entityData.user as any).privateVal); // make sure "read: false" is not leaked
      });

      test('should return "null" if trying to populate a prop that does not exist', async () => {
        const { entityKey: postKey } = await addPost();

        const { entityData } = await PostModel.get(postKey.name as string).populate('unknown');
        // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
        // @ts-ignore
        expect(entityData.unknown).equal(null);
      });

      test('should populate multiple props', async () => {
        const { name: userName, entityKey: userKey } = await addUser();
        const { entityKey: postKey } = await addPost(userKey);

        const { entityData } = await PostModel.get(postKey.name as string).populate(['user', 'publication', 'unknown']);
        expect((entityData.user as any).name).equal(userName);
        expect(entityData.publication).equal(null);
        // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
        // @ts-ignore
        expect(entityData.unknown).equal(null);
      });

      test('should populate multiple props (2)', async () => {
        const { name: userName, entityKey: userKey } = await addUser();
        const { title: publicationTitle, entityKey: publicationKey } = await addPublication(userKey);
        const { entityKey: postKey } = await addPost(userKey, publicationKey);

        const { entityData } = await PostModel.get(postKey.name as string).populate(['user', 'publication']);
        expect((entityData.user as any).name).equal(userName);
        expect((entityData.publication as any).title).equal(publicationTitle);
      });

      test('should populate multiple props by **chaining** populate() calls', async () => {
        const { name: userName, entityKey: userKey } = await addUser();
        const { title: publicationTitle, entityKey: publicationKey } = await addPublication(userKey);
        const { entityKey: postKey } = await addPost(userKey, publicationKey);

        const { entityData } = await PostModel.get(postKey.name as string)
          .populate('user')
          .populate('publication');
        expect((entityData.user as any).name).equal(userName);
        expect((entityData.publication as any).title).equal(publicationTitle);
      });

      test('should allow to select the properties to retrieve', async () => {
        const { entityKey: userKey } = await addUser();
        const { entityKey: postKey } = await addPost(userKey);

        const { entityData } = await PostModel.get(postKey.name as string).populate('user', ['email', 'privateVal']);
        assert.isDefined((entityData.user as any).email);
        assert.isUndefined((entityData.user as any).name);
        assert.isDefined((entityData.user as any).privateVal); // force get private fields
      });

      test('should throw an error when providing multiple properties to populate + fields to select', async () => {
        const { entityKey: userKey } = await addUser();
        const { entityKey: postKey } = await addPost(userKey);

        try {
          // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
          // @ts-ignore
          await PostModel.get(postKey.name).populate(['user', 'publication'], ['email', 'privateVal']);
          throw new Error('Shoud not get here.');
        } catch (err) {
          expect(err.message).equal('Only 1 property can be populated when fields to select are provided');
        }
      });

      // TODO: Re-enable test after mget() is implemented
      // test('should populate multiple entities', async () => {
      //   const { name: userName1, entityKey: userKey1 } = await addUser();
      //   const { name: userName2, entityKey: userKey2 } = await addUser();
      //   const { entityKey: postKey1 } = await addPost(userKey1);
      //   const { entityKey: postKey2 } = await addPost(userKey2);

      //   const [post1, post2] = await PostModel.get([postKey1.name, postKey2.name]).populate('user');
      //   expect((post1.entityData.user as any).id).equal(userKey1.name);
      //   expect((post1.entityData.user as any).name).equal(userName1);
      //   expect((post2.entityData.user as any).id).equal(userKey2.name);
      //   expect((post2.entityData.user as any).name).equal(userName2);
      // });

      test('should allow nested embedded entities', async () => {
        const { name: companyName, entityKey: companyKey } = await addCompany();
        const { name: userName, entityKey: userKey } = await addUser(companyKey);
        const { title: publicationTitle, entityKey: publicationKey } = await addPublication(userKey);
        const { entityKey: postKey } = await addPost(userKey, publicationKey);

        const { entityData } = await PostModel.get(postKey.name as string)
          .populate(['user', 'user.company'])
          .populate('publication')
          .populate('publication.user')
          .populate('publication.user.company')
          .populate('path.that.does.not.exist');

        expect((entityData.user as any).id).equal(userKey.name);
        expect((entityData.user as any).name).equal(userName);
        expect((entityData.user as any).company.name).equal(companyName);
        expect((entityData.publication as any).title).equal(publicationTitle);
        expect(entityData.user).deep.equal((entityData.publication as any).user);
        // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
        // @ts-ignore
        expect(entityData.path.that.does.not.exist).equal(null);
      });

      test('should fetch all key references when no path is specified', async () => {
        const { name: userName, entityKey: userKey } = await addUser();
        const { entityKey: postKey } = await addPost(userKey);

        const { entityData } = await PostModel.get(postKey.name as string).populate();
        expect((entityData.user as any).name).equal(userName);
        expect(entityData.publication).equal(null);
        assert.isUndefined((entityData.user as any).privateVal); // make sure "read: false" is not leaked
      });

      test('should fetch the keys inside a Transaction', async () => {
        const transaction = gstore.transaction();
        sinon.spy(transaction, 'get');

        const { name: userName, entityKey: userKey } = await addUser();
        const { entityKey: postKey } = await addPost(userKey);

        await transaction.run();
        const { entityData } = await PostModel.get(postKey.name, { transaction }).populate('user');
        await transaction.commit();
        expect((transaction.get as any).called).equal(true);
        expect((transaction.get as any).callCount).equal(2);
        expect((entityData.user as any).name).equal(userName);
      });
    });
  });

  describe('findOne()', () => {
    test('should allow the `option.readAll`', async () => {
      const { email, privateVal } = await addUser();

      const user = await UserModel.findOne({ email });
      expect(user!.privateVal).to.equal(null);

      const user2 = await UserModel.findOne({ email }, undefined, undefined, { readAll: true });
      expect(user2!.privateVal).to.equal(privateVal);
    });
  });

  describe('update()', () => {
    describe('transaction()', () => {
      interface MyUser {
        name: string;
        coins: number;
      }

      const mySchema = new Schema<MyUser>(
        {
          name: { joi: Joi.string().required() },
          coins: {
            joi: Joi.number()
              .integer()
              .min(0),
          },
        },
        { joi: true },
      );

      const User = gstore.model('ModelTestsTransaction-User', mySchema);

      // TODO: Re-enable test after mget() is implemented
      // test('should update entity inside a transaction', () => {
      //   function transferCoins(
      //     fromUser: Entity<MyUser> & MyUser,
      //     toUser: Entity<MyUser> & MyUser,
      //     amount: number,
      //   ): Promise<any> {
      //     return new Promise((resolve, reject): void => {
      //       const transaction = gstore.transaction();
      //       transaction
      //         .run()
      //         .then(async () => {
      //           await User.update(
      //             fromUser.entityKey.name as string,
      //             {
      //               coins: fromUser.coins - amount,
      //             },
      //             undefined,
      //             undefined,
      //             transaction,
      //           );

      //           await User.update(
      //             toUser.entityKey.name as string,
      //             {
      //               coins: toUser.coins + amount,
      //             },
      //             undefined,
      //             undefined,
      //             transaction,
      //           );

      //           transaction
      //             .commit()
      //             .then(async () => {
      //               const [user1, user2] = await User.get(
      //                 [fromUser.entityKey.name as string, toUser.entityKey.name as string],
      //                 { preserveOrder: true },
      //               );
      //               expect(user1.name).equal('User1');
      //               expect(user1.coins).equal(0);
      //               expect(user2.name).equal('User2');
      //               expect(user2.coins).equal(1050);
      //               resolve();
      //             })
      //             .catch(err => {
      //               reject(err);
      //             });
      //         })
      //         .catch(err => {
      //           transaction.rollback();
      //           reject(err);
      //         });
      //     });
      //   }

      //   const fromUser = new User({ name: 'User1', coins: 1000 }, randomName());
      //   const toUser = new User({ name: 'User2', coins: 50 }, randomName());

      //   return fromUser
      //     .save()
      //     .then(({ entityKey }) => {
      //       addKey(entityKey);
      //       return toUser.save();
      //     })
      //     .then(({ entityKey }) => {
      //       addKey(entityKey);
      //       return transferCoins(fromUser, toUser, 1000);
      //     });
      // });

      test('should throw a 404 Not found when trying to update a non existing entity', done => {
        User.update(randomName(), { name: 'test' }).catch(err => {
          expect(err.code).equal('ERR_ENTITY_NOT_FOUND');
          done();
        });
      });
    });
  });

  describe('hooks', () => {
    test('post delete hook should set scope on entity instance', () => {
      const schema = new Schema({ name: { type: String } });
      schema.post('delete', function postDelete(this: any, { key }) {
        expect(key.kind).equal('ModelTests-Hooks');
        expect(key.id).equal(123);
        expect(this instanceof GstoreEntity);
        expect(key).equal(this.entityKey);
        return Promise.resolve();
      });
      const Model = gstore.model('ModelTests-Hooks', schema);
      return Model.delete({ id: 123 });
    });
  });
});
