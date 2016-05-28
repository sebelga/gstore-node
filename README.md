# Datastools
Datastools is a Google Datastore entities modeling library for Node.js inspired by Mongoose and built on top of the **gcloud-node** library.

## Motivation
The Google Datastore is an amazing fast, reliable and flexible database for today's modern apps. But it's flexibility (schemaless) sometimes can lead to a lot of duplicate code to **validate** the properties to save. The **pre & post 'hooks'** found in Mongoose are also of great value when it comes to work with entities on a NoSQL database.

Datastools enhances the experience to work with entities of Googe Datastore. It is still in in active development (**no release yet**).

### Install
 ```
 npm install datastools --save
 ```
 
### Getting started
(For info on how to configure gcloud go here: https://googlecloudplatform.github.io/gcloud-node/#/docs/v0.34.0/gcloud?method=gcloud)
 ```
 var configGcloud = {...your config here};
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
Valid property types are
- 'string'
- 'number'
- 'boolean'
- 'datetime' (valid format: 'YYYY-MM-DD' | 'YYYY-MM-DD 00:00:00' | 'YYYY-MM-DD 00:00:00.000' | 'YYYY-MM-DDT00:00:00')
- 'array'

```
var entitySchema = new Schema({
    name:{type:'string'},
    lastname`:{},  // if nothing is passed, no type validation occurs (anything goes in!)
    age:{type:'number'},
    hasPaid:{type:'boolean'},
    createdOn:{type:'datetime'},
    tags:{type:'array'}
});
```

### Values validations
Datastools uses the great validator library (https://github.com/chriso/validator.js) to validate input values so you can use any of the validations from that library.

```
var entitySchema = new Schema({
    email:{validate:'isEmail'},
    website:{validate:'isURL'},
    color:{validate:'isHexColor'},
    ...
});
```
### Other Schema options
#### optional
By default if a property value is not defined it will be set to null or its default value (see below) if any. If you don't want this behaviour you can set it as *optional* and if now value is passed nothing will be saved on the entity.

#### default
You can set a default value for the property is no value has been passed.

#### excludedFromIndex
By default all properties are **included** in the Datastore indexes. If you don't want some properties to be indexed set their 'excludedFromIndex' property to false.

```
var entitySchema = new Schema({
    name:{type:'string'},
    lastname:{excludedFromIndex:true},
    website:{validate:'isURL', optional:true},
    modified:{type:'boolean', default:false},
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
