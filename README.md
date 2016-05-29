# Datastools (work in progress)
Datastools is a Google Datastore entities modeling library for Node.js inspired by Mongoose and built on top of the **gcloud-node** library.

It enhances the experience to work with Googe Datastore entities on Node.js. The main features are:
   - explicit Schema declaration for entities
   - properties type validation
   - properties value validation
   - pre & post hooks on methods (wip)
   - queries shortcuts (wip)
   - custom methods for models (wip)
   
This library is still in in active development (**no release yet**).

<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->
**Table of Contents**  *generated with [DocToc](https://github.com/thlorenz/doctoc)*

- [Motivation](#motivation)
- [Installation](#installation)
  - [Getting started](#getting-started)
- [Schema](#schema)
  - [Creation](#creation)
  - [Properties types](#properties-types)
  - [Properties values validations](#properties-values-validations)
  - [Other properties options](#other-properties-options)
    - [optional](#optional)
    - [default](#default)
    - [excludedFromIndex](#excludedfromindex)
  - [Schema options](#schema-options)
    - [validateBeforeSave (default true)](#validatebeforesave-default-true)
    - [entities](#entities)
- [Model](#model)
  - [Creation](#creation-1)
  - [Instances](#instances)
    - [id param (optional)](#id-param-optional)
    - [ancestors param (optional)](#ancestors-param-optional)
  - [Methods](#methods)
    - [Get()](#get)
    - [Save()](#save)
  - [Queries](#queries)
    - [gcloud queries](#gcloud-queries)
    - [list](#list)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

## Motivation
The Google Datastore is an amazing fast, reliable and flexible database for today's modern apps. But it's flexibility and *schemaless* nature can 
sometimes lead to a lot of duplicate code to **validate** the properties passed and their values. The **pre & post 'hooks'** found in Mongoose are also
 of great value when it comes to work with entities on a NoSQL database. As it is built on top of the great gcloud-node library, all of its API can still be 
 accessed whenever needed. 

## Installation
 ```
 npm install datastools --save
 ```
 
### Getting started
For info on how to configure gcloud [read the docs here](https://googlecloudplatform.github.io/gcloud-node/#/docs/v0.34.0/gcloud?method=gcloud).
 ```
 var configGcloud = {...your config here};
 var gcloud       = require('gcloud')(configGcloud);
 var ds           = gcloud.datastore();
 
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
- 'datetime' (valids are: javascript Date() or a string with the following format: 'YYYY-MM-DD' | 'YYYY-MM-DD 00:00:00' | 'YYYY-MM-DD 00:00:00.000' | 'YYYY-MM-DDT00:00:00')
- 'array'

```
var entitySchema = new Schema({
    name     : {type: 'string'},
    lastname : {},  // if nothing is passed, no type validation occurs (anything goes in!)
    age      : {type: 'number'},
    hasPaid  : {type: 'boolean'},
    createdOn: {type: 'datetime'},
    tags     : {type: 'array'}
});
```

### Properties values validations
Datastools uses the great validator library (https://github.com/chriso/validator.js) to validate input values so you can use any of the validations from that library.

```
var entitySchema = new Schema({
    email  : {validate: 'isEmail'},
    website: {validate: 'isURL'},
    color  : {validate: 'isHexColor'},
    ...
});
```
### Other properties options
#### optional
By default if a property value is not defined it will be set to null or its default value (see below) if any. If you don't want this behaviour you can set it as *optional* and if now value is passed nothing will be saved on the entity.

#### default
You can set a default value for the property is no value has been passed.

#### excludedFromIndex
By default all properties are **included** in the Datastore indexes. If you don't want some properties to be indexed set their 'excludedFromIndex' property to false.

```
// Properties options example
var entitySchema = new Schema({
    name    : {type: 'string'},
    lastname: {excludedFromIndex: true},
    website : {validate: 'isURL', optional: true},
    modified: {type: 'boolean', default: false},
    ...
});
```

### Schema options
#### validateBeforeSave (default true)
To disable any validation before save/update, set it to false

<a name="simplifyResultExplained"></a>
#### entities
**simplifyResult** (default true).
By default the results coming back from the Datastore are serialized into a more readable object format. If you want the full response that includes both the Datastore Key & Data, set simplifyResult to false. This option can be set on a per query basis ([see below](#simplifyResultInline)).

```
// Schema options example
var entitySchema = new Schema({
    name : {type: 'string'}
}, {
    validateBeforeSave : false,
    entities : {
        simplifyResult : false
    }
});
```

## Model
### Creation

```
var datastools = require('datastools');
var Schema     = datastools.Schema;

var entitySchema = new Schema({
    name:{},
    lastname:{},
    email:{}
});

var model = datastools.model('EntityName', entitySchema);
```

### Instances
To create instances of a model call: `new Model(data, id /*optional*/, ancestors /*optional*/)`
- data {object} keys / values pairs of the data to save
- id {int or string} (optional)
- ancestors {Array} (optional)

#### id param (optional)
By default, if you don't pass an id when you create an instance, the entity id will be auto-generated. If you want to manually give the entity an 
id, pass as a second parameter during the instantiation.

```
...
// String id
var blogPost = new BlogPost(data, 'stringId'); // cautious that a '1234' id will be converted to integer 1234

// Integer ir
var blogPost = new BlogPost(data, 1234);
```

#### ancestors param (optional)
Array of an ancestor's path.

```
// Auto generated id on an ancestor
var blogPost = new BlogPost(data, null, ['Parent', 'keyname']);

// Manual id on an ancestor
var blogPost = new BlogPost(data, 1234, ['Parent', 'keyname']);
```

----------

### Methods
#### Get()
Retrieving an entity by key is the fastest way to read from the Datastore.
This method accepts 3 parameters:
- id {int or string}
- ancestors {Array} (optional)
- callback

```
var blogPostSchema = new datastools.Schema({...});
var BlogPost       = datastools.model('BlogPost', blogPostSchema);

// id can be integer or string
BlogPost.get(1234, function(err, entity) {
    if (err) {
        // deal with err
    }
    console.log('Entity:', entity);
});

// Passing an ancestor path
BlogPost.get('keyname', ['Parent', 'parentName'], function(err, entity) {
    if (err) { // deal with err }
    console.log(entity);
});
```

**simplify()** The resulting entity has a simplify() method attached to it that outputs a simplified object with just the entity data and the entity id.

```
BlogPost.get(123, function(err, entity) {
    if (err) { // deal with err }
    console.log(entity.simplify());
});
```

#### Save()

```
var datastools = require('datastools');

var blogPostSchema = new datastools.Schema({
    title :     {type:'string'},
    createdOn : {type:'datetime'}
});

var BlogPost = datastools.model('BlogPost', blogPostSchema);

var data = {
    title :    'My first blog post',
    createdOn : new Date()
};
var blogPost = new BlogPost(data);

blogPost.save(function(err) {
    if (err) {
        // deal with err
    }
    console.log('Great! post saved');
});
```

----------

### Queries
#### gcloud queries
Datastools is built on top of [gcloud-node](https://googlecloudplatform.github.io/gcloud-node/#/docs/v0.34.0/datastore/query) so you can execute any query from that library.

```
var BlogPost = datastools.model('BlogPost', schema);

var query = BlogPost.query();

query.filter('name', '=', 'John')
     .filter('age', '>=', 4)
     .order('lastname', {
         descending: true
     });

query.run(function(err, entities, info) {
    if (err) {
        // deal with err
    }
    console.log('Entities found:', entities);
});
```

<a name="simplifyResultInline"></a>
**options**:
query.run() accepts a first options argument with the following properties
- simplifyResult : true|false (see [explanation above](#simplifyResultExplained))

```
query.run({simplifyResult:false}, function(err, entities, info) {
    ....
})
```

#### list
Shortcut for listing the entities. For complete control (pagination, start, end...) use the above gcloud queries. List queries are meant to quickly list entites with predefined settings.
Currently it support the following settings:
- limit
- order
- select
- ancestors
- filters (default operator is "=" and does not need to be passed

```
var blogPostSchema = new datastools.Schema({
    title : {type:'string'},
    createdOn : {type:'datetime'}
});

var querySettings = {
    limit    : 10,
    order    : {property: 'title'},
    select   : 'title'
    ancestors: ['Parent', 123],  // will add a hasAncestor filter
    filters  : ['title', 'My first post'] // operator defaults to "="
};

blogPostSchema.queries('list', querySettings);
var BlogPost = datastools.model('BlogPost', blogPostSchema);

...

// anywhere in your Controllers
BlogPost.list(function(err, entities) {
    if (err) {
        // deal with err
    }
    console.log(entities);
});
```

Order, Select & filters settings can also be **arrays**

```
var querySettings = {
    orders  : [{property: 'title'}, {property:'createdOn', descending:true}]
    select  : ['title', 'createdOn'],
    filters : [['title', 'My first post'], ['createdOn', '<',  new Date()]]
};
```

The settings can be overriden anytime by passing another settings object as first parameter

```
var newSettings = {
    limit : 20
};

BlogPost.list(newSettings, function(err, entities) {
    if (err) {
        // deal with err
    }
    console.log(entities);
});
```

Just like with gcloud queries, there is an extra setting you can set: **simplifyResult** (default to true) to receive the full Datastore data or a 
simplified response.

```
var newSettings = {
    limit : 20,
    simplifyResult : false
};

BlogPost.list(newSettings, ...);
```
