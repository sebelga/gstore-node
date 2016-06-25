# Datastools

[![npm version](https://badge.fury.io/js/datastools.svg)](https://badge.fury.io/js/datastools) [![Build Status](https://travis-ci.org/sebelga/datastools.svg?branch=master)](https://travis-ci.org/sebelga/datastools)
[![Coverage Status](https://coveralls.io/repos/github/sebelga/datastools/badge.svg?branch=master)](https://coveralls.io/github/sebelga/datastools?branch=master)
Datastools is a Google Datastore entities modeling library for Node.js inspired by Mongoose and built on top of the **[gcloud-node](https://github.com/GoogleCloudPlatform/gcloud-node)** library.

Its main features are:

- explicit **Schema declaration** for entities
- properties **type validation**
- properties **value validation**
- queries **shortcuts**
- pre & post **middlewares** (hooks)
- **custom methods** on entity instances


This library is in in active development, please report any issue you might find.

----------

<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->
**Table of Contents**  *generated with [DocToc](https://github.com/thlorenz/doctoc)*

- [Motivation](#motivation)
- [Installation](#installation)
  - [Getting started](#getting-started)
    - [Aliases](#aliases)
    - [runInTransaction alias](#runintransaction-alias)
- [Schema](#schema)
  - [Creation](#creation)
  - [Properties types](#properties-types)
  - [Properties values validations](#properties-values-validations)
  - [Other properties options](#other-properties-options)
    - [optional](#optional)
    - [default](#default)
    - [excludeFromIndexes](#excludefromindexes)
    - [read](#read)
    - [write](#write)
  - [Schema options](#schema-options)
    - [validateBeforeSave (default true)](#validatebeforesave-default-true)
    - [explicitOnly (default true)](#explicitonly-default-true)
    - [queries](#queries)
  - [Schema methods](#schema-methods)
    - [path()](#path)
- [Model](#model)
  - [Creation](#creation-1)
  - [Methods](#methods)
    - [Get()](#get)
    - [Update()](#update)
    - [Delete()](#delete)
    - [Other methods](#other-methods)
      - [excludeFromIndexes()](#excludefromindexes)
      - [sanitize()](#sanitize)
- [Entity](#entity)
  - [Instantiate](#instantiate)
    - [id parameter (optional)](#id-parameter-optional)
    - [ancestors parameter (optional)](#ancestors-parameter-optional)
    - [namespace parameter (optional)](#namespace-parameter-optional)
  - [Properties](#properties)
  - [Methods](#methods-1)
    - [Save()](#save)
    - [Other methods](#other-methods-1)
      - [plain(readAll)](#plainreadall)
      - [get(path)](#getpath)
      - [set(path, value)](#setpath-value)
      - [datastoreEntity()](#datastoreentity)
- [Queries](#queries)
  - [gcloud queries](#gcloud-queries)
  - [list()](#list)
    - [Override settings](#override-settings)
  - [findOne()](#findone)
  - [findAround()](#findaround)
  - [deleteAll()](#deleteall)
- [Middelwares (Hooks)](#middelwares-hooks)
  - [Pre hooks](#pre-hooks)
  - [Post hooks](#post-hooks)
  - [Transactions and Hooks](#transactions-and-hooks)
- [Methods](#methods-2)
- [Credits](#credits)

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

#### Aliases

After a successfull connection, datastools has 2 aliases set up

- `datastools.ds` The gcloud datastore instance
- `datastools.runInTransaction`. Alias of the same gcloud method

#### runInTransaction alias

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
Valid types are

- 'string'
- 'int' --> an integer or gcloud.datastore.int
- 'double' --> a float or gcloud.datastore.double
- 'boolean'
- 'datetime' (valids are: javascript Date() or a string with the following format: 'YYYY-MM-DD' | 'YYYY-MM-DD 00:00:00' | 'YYYY-MM-DD 00:00:00.000' | 'YYYY-MM-DDT00:00:00')
- 'array'
- 'object'
- 'geoPoint' —> gcloud.datastore.geoPoint
- 'buffer' —> Buffer

```
var entitySchema = new Schema({
    name     : {type: 'string'},
    lastname : {},  // if nothing is passed, no type validation occurs (any type is allowed)
    age      : {type: 'number'},
    price    : {type: 'double'},
    isDraft  : {type: 'boolean'},
    createdOn: {type: 'datetime'},
    tags     : {type: 'array'},
    prefs    : {type: 'object'},
    position : {type: 'geoPoint'}
    icon     : {type: 'buffer'}
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
By default if a property value is not defined it will be set to null or to its default value (if any). If you don't want this behaviour you can set it as *optional* and if no value is passed, this property will not be saved in the Datastore.

#### default
You can set a default value for the property is no value has been passed.

#### excludeFromIndexes
By default all properties are **included** in the Datastore indexes. If you don't want some properties to be indexed set their 'excludeFromIndexes' property
to false.

<a name="schemaPropertyOptionRead"></a>
#### read
If you don't want certain properties to show up in the result of queries (with *simplifyResult* set to true) or when calling entity.plain(), set this property option to **false**. This is useful when you need to have entity properties only visible to your business logic and not exposed publicly.

This setting can be overridden by passing a *readAll* setting set to **true** in:

- entity.**plain**(readAll); // true | false
- **globally** in list() and a Schema *queries* settings
- **inline** settings of list(), query() and findAround()

#### write
If you want to protect certain properties to be written by a user, you can set their *write* option to **false**. You can then call [sanitize()](#modelSanitize) on a Model passing the user data and those properties will be removed. Example: `var data = BlogPostModel.sanitize(req.body);`


```
// Properties options example
var entitySchema = new Schema({
    name    :  {type: 'string'},
    lastname:  {excludeFromIndexes: true},
    website :  {validate: 'isURL', optional: true},
    modified:  {type: 'boolean', default: false, read:false}, // won't show up in queries
    createdOn: {type:'datetime', write:false} //will be removed from data on sanitize(data)
    ...
});
```

### Schema options
#### validateBeforeSave (default true)
To disable any validation before save/update, set it to false

#### explicitOnly (default true)
To allow unregistered properties on a schema set `explicitOnly : false`. This will bring back the magic of *Schemaless* databases. The properties explicitly declared will still be validated.

<a name="simplifyResultExplained"></a>
#### queries
**simplifyResult** (default true).
By default the results coming back from Datastore queries are merged into a simpler object format. If you prefer the full response that includes both the Datastore Key & Data, set simplifyResult to false. This option can be set on a per query basis ([see below](#simplifyResultInline)).

**readAll** (default false)
Override the Schema option property 'read' ([see above](#schemaPropertyOptionRead)) and read all the properties of the entities.

```
// Schema options example
var entitySchema = new Schema({
    name : {type: 'string'}
}, {
    validateBeforeSave : false,
    explicitOnly : false,
    queries : {
        simplifyResult : false,
        readAll : true
    }
});
```

### Schema methods
#### path()
Getter / Setter for schemas paths.

```
var mySchema = new Schema({name:{type:'string'});

// Getter
mySchema.path('name'); // returns {type:'string'}

// Setter
mySchema.path('email', {type:'string', validate :'isEmail'});

// From a Model
var User = datastools.model('User');

// add new path to User Schema
User.schema.path('age', {type:'number'});

```

## Model
### Creation

```
var datastools = require('datastools');
var Schema     = datastools.Schema;

var userSchema = new Schema({
    name:{},
    lastname:{},
    email:{}
});

var User = datastools.model('User', userSchema);
```

----------

### Methods
#### Get()
Retrieving an entity by key is the fastest way to read from the Datastore.
This method accepts the following parameters:

- id {int, string} (can also be an **array** of ids to retreive)
- ancestors {Array} (optional)
- namespace (optional)
- transaction (optional)
- callback

Returns: an entity **instance**.

```
var blogPostSchema = new datastools.Schema({...});
var BlogPost       = datastools.model('BlogPost', blogPostSchema);

// id can be integer or string
BlogPost.get(1234, function(err, entity) {
    if (err) {
        // deal with err
    }
    console.log('Blogpost title:', entity.get('title'));
});

// Passing an ancestor path
BlogPost.get('keyname', ['Parent', 'parentName'], function(err, entity) {
    if (err) { // deal with err }
    ...
});
```

The resulting entity has a **plain()** method ([see below](#entityPlain)) attached to it that returns only the entity data and its id.

```
BlogPost.get(123, function(err, entity) {
    if (err) { // deal with err }
    console.log(entity.plain());
});
```

If you need to retreive an entity from inside a transaction, pass it as fourth parameter.

```
var error;

datastools.runInTransaction(function(transaction, done) {
	BlogPost.get(123, null, null, transaction, function(err, entity) {
	    if (err) {
	        error = err;
	        transaction.rollback(done);
	        return;
	    }

	    // entity is an instance of the BlogPost model with all its properties & methods

	    ... keep up until calling done();
	});

}, function(transactionError, apiResp) {
	if (transactionError || error) {
	    // deal with err;
	}
});
```

#### Update()
To update a Model, call `Model.update(args)`. This will get the entity from the Datastore, update its data with the ones passed and save it back to the Datastore (after validating the data).
The update() method has the following parameters

- id : the id of the entity to update
- data : the data to save
- ancestors (optional) : an array of ancestors path
- namespace (optional)
- transaction (optional)
- callback

Returns: an entity **instance**.

```
...

var BlogPost = datastools.model('BlogPost');

var data = {
    title : 'New title'
};

BlogPost.update(123, data, function(err, entity) {
    if (err) {
        // deal with err
    }
    console.log(entity.plain());
});

// You can also pass an optional ancestors path and a namespace
BlogPost.update(123, data, ['Grandpa', 123, 'Dad', 123], 'dev.namespace.com', function(err, entity) {
    if (err) {
        // deal with err
    }
    console.log(entity);
});

// The same method can be executed from inside a transaction
datastools.runInTransaction(function(transaction, done){

	BlogPost.update(123, data, null, null, transaction, function(err, entity){...});

}, function(){...});

```

#### Delete()
You can delete an entity by calling `delete(args)` on the Model.  This method accepts the following parameters

- id : the id to delete. Can also be an **array** of ids
- ancestors (optional)
- namespace (optional)
- transaction (optional)
- callback


The callback has a "success" properties that is set to true if an entity has been deleted or false if not.

```
var BlogPost = datastools.model('BlogPost');

BlogPost.delete(123, function(err, success, apiResponse) {
    if (err) {
        // deal with err
    }
    if (!success) {
        console.log('No entity deleted. The id provided didn't return any entity');
    }
});

// With an array of ids
BlogPost.delete([123, 456, 789], function(err, success, apiResponse) {...}

// With ancestors and a namespace
BlogPost.delete(123, ['Parent', 123], 'dev.namespace.com', function(err, success, apiResponse) {...}

// Transaction
// -----------
// The same method can be executed from inside a transaction
// Important: you need to execute done() from the callback as Datastools needs to execute
// the "pre" hooks before deleting the entity

datastools.runInTransaction(function(transaction, done){

	BlogPost.delete(123, null, null, transaction, function() {

		[... any other transaction operation]

		done();
	});

}, function(){...});

```

----

#### Other methods
##### excludeFromIndexes()
On Schemaless Models (explicityOnly setting set to false), all the properties not declared explicitly will automatically be added to  Google Datastore indexes. If you don't want this behaviour you can call `Model.excludeFromIndexes(property)` passing a **string** property or an **array** of properties. If one of the property passed is already declared on the Schema, this method will set its excludeFromIndexes value to false.

```
var blogPostSchema = new Schema({
    title: {type:'string'}
}, {explicitOnly:false});

BlogPostModel = datastools.model('BlogPost', blogPostSchema);

...

var blogPost = new BlogPost({
    title:'my-title',
    text:'some very long text that can not be indexed because of the limitation of the Datastore'});

/*
If you save this entity, the text won't be saved in the Datastore
because of the size limitation of the indexes (can't be more tha 1500 bytes).
Assuming that the text propery is dynamic and is not known at Schema instantiation, you need to remove "text" propery from indexes.
*/

BlogPost.excludeFromIndexes('text');

// now you can save the entity
blogPost.save(function(err, entity) {...});

```

<a name="modelSanitize"></a>
##### sanitize()

This methods will clean and do basic formatting of an entity data. It is a good practice to call it on data coming from an untrusted source.
Executing it will:

- remove properties that are marked as not *writable* in schemas
- convert 'null' (string) values to null

```
var userSchema = new Schema({
    name : {type:'string'},
    createdOn : {type:'datetime', write:false}
});

...
// in your Controller

var data = req.body; // body request
console.log(data.createdOn); // '2016-03-01T21:30:00';

data = UserModel.sanitize(data);
console.log(data.createdOn); // undefined


```

## Entity
Each entity is an instance of its Model that has a Datastore Key and data.

### Instantiate

To create instances of a model use

`new Model(data, id /*optional*/, ancestors /*optional*/, namespace /*optional*/)`

- data {object} keys/values pairs of the entity data
- id {int or string} (optional)
- ancestors {Array} (optional)
- namespace {string} (optional)

#### id parameter (optional)
By default, if you don't pass an id when you create an instance, the entity id will be auto-generated. If you want to manually give the entity an id, pass it as a second parameter during the instantiation.

```
...
// String id
var blogPost = new BlogPost(data, 'stringId'); // warning: a '1234' id will be converted to integer 1234

// Integer ir
var blogPost = new BlogPost(data, 1234);
```

#### ancestors parameter (optional)
Array of an ancestor's path.

```
// Auto generated id on an ancestor
var blogPost = new BlogPost(data, null, ['Parent', 'keyname']);

// Manual id on an ancestor
var blogPost = new BlogPost(data, 1234, ['Parent', 'keyname']);
```

#### namespace parameter (optional)
By default entities keys are generated with the default namespace (defined when setting up the datastore instance). You can create models instances on
another namespace by passing it as a third parameter.

```
// Creates an entity with auto-generated id on the namespace "dev-com.my-domain"
var blogPost = new BlogPost(data, null, null, 'dev-com.my-domain');

```

### Properties

- **entityData**. The properties data of the entity.
- **entityKey**. The entity key saved in the Datastore.


### Methods

#### Save()

After the instantiation of a Model, you can persist its data to the Datastore with `entity.save(transaction /*optional*/, callback)`

```
var datastools = require('datastools');

var blogPostSchema = new datastools.Schema({
    title :     {type:'string'},
    createdOn : {type:'datetime', default:new Date()}
});

var BlogPost = datastools.model('BlogPost', blogPostSchema);

var data = {
    title : 'My first blog post'
};
var blogPostEntity = new BlogPost(data);

blogPostEntity.save(function(err) {
    if (err) {// deal with err}

    // the function scope (this) is the entity instance.
    console.log(this.plain());
    console.log(this.get('title')); // 'My first blog post'
    console.log(this.entityKey.id); // to get the auto generated id
});

/*
* From inside a transaction
*/

datastools.runInTransaction(function(transaction, done){

	var user = new User({name:'john'}); // user could also come from a query() or get()
	user.save(transaction);

	... other transaction operations until calling done()

}, function(){...});

```


#### Other methods

<a name="entityPlain"></a>
##### plain(readAll)
This methods returns the entity **data** and its entityKey **id** (int or string)

##### get(path)
Get the value of an entity data at a specific path

```
user = new User({name:'John'});
user.get('name'); // John
```

##### set(path, value)
Set the value of an entity data at a specific path

```
user = new User({name:'John'});
user.set('name', 'Mike');
user.get('name'); // Mike
```

##### datastoreEntity()
In case you need at any moment to fetch the entity data from the Datastore, this method will do just that right on the entity instance.

```
var user = new User({name:'John'});

user.save(function(err, userEntity) {
	// userEntity is an *Datastools* entity instance of a User Model

	entity.datastoreEntity(function(err, entity){
		// here the entity is the entity saved *in* the Google Datastore
		// with a key and data property
	});
});
```

----------

## Queries
### gcloud queries

Datastools is built on top of [gcloud-node](https://googlecloudplatform.github.io/gcloud-node/#/docs/v0.35.0/datastore/query) so you can execute any query from this library.

```
var User = datastools.model('User'); // with User schema previously defined

// 1. Initialize query
var query = User.query()
            .filter('name', '=', 'John')
            .filter('age', '>=', 4)
            .order('lastname', {
                descending: true
            });

// 2. Execute query.
// The callback response contains both the entities and the cursor if there are more results

query.run(function(err, response) {
    if (err) {
        // deal with err
    }

    // response contains both the entities and a nextPageCursor for pagination
    var entities       = response.entities;
    var nextPageCursor = response.nextPageCursor; // not present if no more results
});

// You can then use the nextPageCursor when calling the same query and set it as a start value
var query = User.query()
            .filter('name', '=', 'John')
            .filter('age', '>=', 4)
            .order('lastname', {
                descending: true
            })
            .start(nextPageCursor);

```

**namespace**
Model.query() takes an optional namespace parameter if needed.

```
var query = User.query('com.domain-dev')
                .filter('name', '=', 'John');
...
```

<a name="simplifyResultInline"></a>
**options**:
query.run() accepts a first options parameter with the following properties
- simplifyResult : true|false (see [explanation above](#simplifyResultExplained))

```
query.run({simplifyResult:false}, function(err, response) {
    ....
})
```

### list()
Shortcut for listing the entities. For complete control (pagination, start, end...) use the above gcloud queries. List queries are meant to quickly list entites with predefined settings.

Currently it support the following queries parameters

- limit
- order
- select
- ancestors
- filters (default operator is "=" and does not need to be passed


**Define on Schema**

`entitySchema.queries('list', {...settings});`

Example
```
// Create Schema
var blogPostSchema = new datastools.Schema({
    title : {type:'string'}
});

// List settings
var querySettings = {
    limit    : 10,
    order    : {property: 'title', descending:true}, // descending defaults to false and is optional
    select   : 'title'
    ancestors: ['Parent', 123],  // will add a hasAncestor filter
    filters  : ['title', 'My first post'] // operator defaults to "="
};

// Add to schema
blogPostSchema.queries('list', querySettings);

// Create Model
var BlogPost = datastools.model('BlogPost', blogPostSchema);
```

**Use anywhere**

`Model.list(callback)`
The response object in the callback contains both the entities and a **nextPageCursor** for pagination (that could be used in a next `Model.list({start:pageCursor}, function(){...}` call)

```
// anywhere in your Controllers
BlogPost.list(function(err, response) {
    if (err) {
        // deal with err
    }
    console.log(response.entities);
    console.log(response.nextPageCursor); // only present if more results
});
```

Order, Select & filters can also be **arrays** of settings

```
var querySettings = {
    orders  : [{property: 'title'}, {property:'createdOn', descending:true}]
    select  : ['title', 'createdOn'],
    filters : [['title', 'My first post'], ['createdOn', '<',  new Date()]]
};
```

**Override settings**
These global settings can be overridden anytime by passing new settings as first parameter. `Model.list(settings, cb)`

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

**additional settings** in override
- simplifyResult {true|false}
- namespace {string}

Just like with gcloud queries, **simplifyResult** can be set to receive the full Datastore data for each entity or a simplified response.
Use the **namespace** setting to override the default namespace defined globally when setting up the Datastore instance.

```
var newSettings = {
    ...
    simplifyResult : false,
    namespace:'com.domain-dev'
};

BlogPost.list(newSettings, ...);
```

### findOne()
```
User.findOne({prop1:value, prop2:value2}, ancestors /*optional*/, namespace /*optional*/, callback);
```

Quickly find an entity by passing key/value pairs. You can optionaly pass an ancestors array and a namespace.
The entity returned is a entity **instance** of the Model.

```
var User = datastools.model('User');

User.findOne({email:'john@snow.com'}, function(err, entity) {
    if (err) {... deal with error}

    console.log(entity.plain());
    console.log(entity.get('name'));
});

```

### findAround()
`Model.findAround(property, value, settings, callback)`

Find entities before or after an entity based on a property and a value.
**settings** is an object that contains *either* "before" or "after" with the number of entities to retreive.
You can also override the "simplifyResult" global queries setting.

```
// Find the next 20 post after march 1st
BlogPost.findAround('publishedOn', '2016-03-01', {after:20}, function(err, entities){
   ...
});

// Find 10 users before Mick Jagger
User.findAround('lastname', 'Jagger', {before:10, simplifyResult:false}, function(err, entities){
   ...
});

```

### deleteAll()
```
BlogPost.deleteAll(ancestors /*optional*/, namespace /*optional*/, callback)
```
If you need to delete all the entities of a certain kind, this shortcut query will do just that.

```
BlogPost.deleteAll(function(err, result){
    if (err) {// deal with err}

    console.log(result.message);
});

// With ancestors path and namespace
BlogPost.deleteAll(['Grandpa', 1234, 'Dad', 'keyname'], 'com.new-domain.dev', function(err) {...})
```



## Middelwares (Hooks)
Middelwares or 'Hooks' are functions that are executed right before or right after a specific action on an entity.
For now, hooks are available for the following methods

- save (are also executed on Model.**update()**)
- delete

### Pre hooks
Each pre hook has a "**next**" parameter that you have to call at the end of your function in order to run the next "pre" hook or execute to.

A common use case would be to hash a user's password before saving it into the Datastore.

```
...

var bscrypt = require('bcrypt-nodejs');

var userSchema = new Schema({
    user :     {'string'},
    email :    {'string', validate:'isEmail'},
    password : {'string', excludeFromIndexes: true}
});

userSchema.pre('save', hashPassword);

function hashPassword(next) {
    var _this    = this;
    var password = this.get('password');

    if (!password) {
        return next();
    }

    bcrypt.genSalt(5, function (err, salt) {
        if (err) return next(err);

        bcrypt.hash(password, salt, null, function (err, hash) {
            if (err) return next(err);
             _this.set('password', hash);

            // don't forget to call next()
            next();
        });
    });
}

...

// Then when you create a new user and save it (or when updating it)
// its password will automatically be hashed
var User = datastools.model('User');
var user = new User({username:'john', password:'mypassword'});
user.save(function(err, entity) {
    console.log(entity.get('password')); // $2a$05$Gd/7OGVnMyTDnaGC3QfEwuQ1qmjifli3MvjcP7UGFHAe2AuGzne5.
});
```

**Note**
The pre('delete') hook has its scope set on the entity to be deleted. **Except** when an *Array* of ids is passed when calling Model.delete().

```
blogSchema.pre('delete', function(next) {
	console.log(this.entityKey); // the datastore entity key to be deleted

	// By default this.entityData is not present because the entity is *not* fetched from the Datastore.
	// You can call this.datastoreEntity() here (see the Entity section) to fetch the
	// data from the Datastore and do any other logic before calling next()
});
```

### Post hooks
Post are defined the same way as pre hooks. The only difference is that there is no "next" function to call.

```
var schema = new Schema({username:{...}});
schema.post('save', function(){
    var email = this.get('email');
    // do anything needed, maybe send an email of confirmation?
});
```

**Note**
The post('delete') hook does not have its scope maped to the entity as it is not retreived. But the hook has a first argument with the key(s) that have been deleted.

```
schema.post('delete', function(keys){
	// keys can be one Key or an array of entity Keys that have been deleted.
});
```


### Transactions and Hooks

When you save or delete an entity from inside a transaction, Datastools adds an extra **execPostHooks()** method to the transaction.
If the transaction succeeds and you have any post('save') or post('delete') hooks on any of the entities modified during the transaction you need to call this method to execute them.

```
datastools.runInTransaction(function(transaction, done){

	var user = new User({name:'john'}); // user could also come from a query() or get()
	user.save(transaction);

	BlogPost.delete(123, null, null, transaction);

	done();

}, function(transactionError){
    if (transactionError) { // deal with error }

    // no error, call postHooks

    transaction.execPostHooks();
});

```

## Custom Methods
Custom methods can be attached to entities instances.

```
var schema = new Schema({name:{type:'string'}, lastname:{type:'string'}});

// add a fullName() method
schema.methods.fullName = function(cb) {
    cb(null, this.get('name') + ' ' + this.get('lastname'));
};
var User = datastools.model('User', schema);

...

// You can then call it on any instances of user
var user = new User({name:'John', lastname:'Snow'});
user.fullName(function(err, result) {
    console.log(result); // 'John Snow';
});
```

Note that entities instances can also access other models through `entity.model('MyModel')`. *Denormalization* can then easily be done with a custom method:

```
...
// custom getImage() method on the User Schema
userSchema.methods.getImage = function(cb) {
    // Any type of query can be done here
    return this.model('Image').get(this.get('imageIdx'), cb);
};
...
// In your controller
var user = new User({name:'John', imageIdx:1234});
user.getImage(function(err, imageEntity) {
    user.set('profilePict', imageEntity.get('url'));
    user.save(function(err){...});
});
```

## Credits
I have been heavily inspired by [Mongoose](https://github.com/Automattic/mongoose) to write Datastools. Credits to them for the Schema, Model and Entity
definitions, as well as 'hooks', custom methods and other similarities found here.
Not much could neither have been done without the great work of the guys at [gcloud-node](https://github.com/GoogleCloudPlatform/gcloud-node).
