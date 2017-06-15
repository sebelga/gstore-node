<img title="logo" src="logo/logo.png" width="75%">

# gstore-node

[![npm version](https://badge.fury.io/js/gstore-node.svg)](https://badge.fury.io/js/gstore-node) [![Build Status](https://travis-ci.org/sebelga/gstore-node.svg?branch=master)](https://travis-ci.org/sebelga/gstore-node)
[![Coverage Status](https://coveralls.io/repos/github/sebelga/gstore-node/badge.svg?branch=master)](https://coveralls.io/github/sebelga/gstore-node?branch=master)  
gstore-node is a Google Datastore entities modeling library for Node.js inspired by Mongoose and built **on top** of the **[@google-cloud/datastore](https://googlecloudplatform.github.io/google-cloud-node/#/docs/datastore/master/datastore)** library.  
It is not a replacement of @google-cloud/datastore but a tool built to help modeling Entities through Schemas and to help validating the data saved in the Datastore.

Its main features are:

- explicit **Schema declaration** for entities
- properties **type validation**
- properties **value validation**
- **shortcuts** queries
- pre & post **middleware** (hooks)
- **custom methods** on entity instances

This library is in active development, please report any issue you might find.

# Installation

```js
npm install gstore-node --save
```

INFO: With npm v3+ **you don't need** to install @google-cloud/datastore as a dependency of your project as it is already a dependency of gstore-node.

# Getting started

Import gstore-node and @google-cloud/datastore and configure your project.  
For the information on how to configure @google-cloud/datastore [read the docs here](https://googlecloudplatform.github.io/google-cloud-node/#/docs/datastore/master/datastore).

```js
const gstore = require('gstore-node');
const datastore = require('@google-cloud/datastore')({
    projectId: 'my-google-project-id',
});

// Then connect gstore to the datastore
gstore.connect(datastore);
```

After connecting gstore to the datastore, gstore has 2 aliases set up

- `gstore.ds`  
The @google/datastore instance. This means that you can access **all the API** of the Google library when needed.

- `gstore.transaction`. Alias of the same google-cloud/datastore method

# Documentation
The [complete documentation of gstore-node](https://sebelga.gitbooks.io/gstore-node/content/) is in gitbook.

# Example

Initialize gstore-node in your server file
```js
// server.js
const gstore = require('gstore-node');
const datastore = require('@google-cloud/datastore')({
    projectId: 'my-google-project-id',
});
gstore.connect(datastore);

```

Create your Model
```js
// user.model.js

const gstore = require('gstore-node');
const bscrypt = require('bcrypt-nodejs');

const Schema = gstore.Schema;

/**
 * A custom validation function for an embedded entity
 */
const validateAccessList = (value, validator) => {
    if (!Array.isArray(value)) {
        return false;
    }

    return value.some((item) => {
        const isValidIp = !validator.isEmpty(item.ip) && validator.isIP(item.ip, 4);
        const isValidHostname = !validator.isEmpty(item.hostname);

        return isValidHostname && isValidIp;
    });
}

/**
 * Create the schema for the User Model
*/
const userSchema = new Schema({
    firstname: { type: 'string', required: true },
    lastname: { type: 'string', optional: true  },
    email: { type: 'string', validate: 'isEmail', required: true },
    password: { type: 'string', read: false, required: true },
    createdOn: { type: 'string', default: gstore.defaultValues.NOW, write: false, read: false },
    dateOfBirth: { type: 'datetime' },
    bio: { type: 'string', excludeFromIndexes: true },
    website: { validate: 'isURL', optional: true },
    ip: {
        validate: {
            rule: 'isIP',
            args: [4],
        }
    },
    accessList: {
        validate: {
            rule: validateAccessList,
        }
    },
});

/**
 * List entities query shortcut
 */
const listSettings = {
    limit: 15,
    order: { property: 'lastname' }
};
userSchema.queries('list', listSettings);

/**
 * Pre "save" middleware
 * Each time the entity is saved or updated, if there is a password passed, it will be hashed
*/
function hashPassword() {
    // scope *this* is the entity instance
    const _this = this;
    const password = this.password;

    if (!password) {
        return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
        bcrypt.genSalt(5, function onSalt(err, salt) {
            if (err) {
                return reject(err);
            };

            bcrypt.hash(password, salt, null, function onHash(err, hash) {
                if (err) {
                    // reject will *not* save the entity
                    return reject(err);
                };

                _this.password = hash;

                // resolve to go to next middleware or save method
                return resolve();
            });
        });
    });
}

// add the "pre" middleware to the save method
userSchema.pre('save', hashPassword);

/**
 * Export the User Model
 * It will generate "User" entity kind in the Datastore
*/
module.exports = gstore.Model('User', userSchema);

```
Use it in your Controller

```js
// user.constroller.js

const gstore = require('gstore-node');
const User = require('./user.model');

const getUsers(req ,res) {
    const pageCursor = req.query.cursor;

    User.list({ start: pageCursor })
        .then((entities) => {
            res.json(entities);
        })
        .catch(err => res.status(500).json(err));

const getUser(req, res) {
    const userId = +req.params.id;
    User.get(userId)
        .then((entity) => {
            res.json(entity.plain());
        })
        .catch(err => res.status(500).json(err));
}

const createUser(req, res) {
    const entityData = User.sanitize(req.body);
    const user = new User(entityData);

    user.save()
        .then((entity) => {
            res.json(entity.plain());
        })
        .catch((err) => {
            // If there are any validation error on the schema
            // they will be in this error object
            res.status(500).json(err);
        })
}

const updateUser(req, res) {
    const userId = +req.params.id;
    const entityData = User.sanitize(req.body); // ex: { email: 'john@snow.com' }

    /**
     * This will fetch the entity, merge the data and save it back to the Datastore
    */
    User.update(userId, entityData)
        .then((entity) => {
            res.json(entity.plain());
        })
        .catch((err) => {
            // If there are any validation error on the schema
            // they will be in this error object
            res.status(500).json(err);
        })
}

const deleteUser(req, res) {
    const userId = +req.params.id;
    User.delete(userId)
        .then((response) => {
            res.json(response);
        })
        .catch(err => res.status(500).json(err));
}

module.exports = {
    getUsers,
    getUser,
    createUser,
    updateUser,
    deleteUser
}

```

# Credits
I have been heavily inspired by [Mongoose](https://github.com/Automattic/mongoose) to write gstore. Credits to them for the Schema, Model and Entity
definitions, as well as 'hooks', custom methods and other similarities found here.
Not much could neither have been done without the great work of the guys at [gcloud-node](https://github.com/GoogleCloudPlatform/gcloud-node).
