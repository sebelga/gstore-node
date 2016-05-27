# datastools
datastools is a Google Datastore entities modeling library for Node.js inspired by Mongoose and built on top of the gcloud-node library.

## Motivation
The Google Datastore is an amazing fast and reliable database but I realized that a lot of times I was missing some very nice features from Mongoose like the
 ability to define a Schema for the models, validate those or have some pre/post 'hooks' on the model's methods. These are -for now- the main purpose of this 
 library which is still in in active development (no release yet).

### Install
 ```
 npm install datastools --save
 ```
 
### Getting started
(For info on how to configure gcloud go here: https://googlecloudplatform.github.io/gcloud-node/#/docs/v0.34.0/gcloud?method=gcloud)
 ```
 var configGcloud = {};
 var gcloud = require('gcloud')(configGcloud);
 var ds = gcloud.datastore(configDatastore);
 
 var datastools = require('datastools');
 datastools.connect(ds);
 ```

## Schema
### Creation
```
var datastools = require('datastools');
var Schema     = datastools.Schema;

var entitySchema = new Schema({
    name:{},
    lastname:{},
    ...
});
```

### Properties types
For now 3 properties type are validated
- 'string' (default)
- 'number'
- 'datetime' (valid format: 'YYYY-MM-DD' | 'YYYY-MM-DD 00:00:00' | 'YYYY-MM-DD 00:00:00.000' | 'YYYY-MM-DDT00:00:00')

```
var entitySchema = new Schema({
    name:{type:'string'},
    lastname`:{},  // if nothing is passed, default is type:'string'
    age:{type:'number'},
    createdOn:{type:'datetime'}
});
```

### Properties validations
datastools uses the amazing validator library (https://github.com/chriso/validator.js) so you can use any of the validation from there.

```
var entitySchema = new Schema({
    email:{validate:'isEmail'},
    website:{validate:'isURL'},
    color:{validate:'isHexColor},
    ...
});
```

## Model

```
var datastools = require('../datastools');
var Schema     = datastools.Schema;

var entitySchema = new Schema({
    name:{},
    lastname:{},
    email:{}
});

var model = datastools.model('EntityName', entitySchema);
```
