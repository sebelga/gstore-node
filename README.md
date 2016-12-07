# gstore Node.js

[![npm version](https://badge.fury.io/js/gstore-node.svg)](https://badge.fury.io/js/gstore-node) [![Build Status](https://travis-ci.org/sebelga/gstore-node.svg?branch=master)](https://travis-ci.org/sebelga/gstore-node)
[![Coverage Status](https://coveralls.io/repos/github/sebelga/gstore-node/badge.svg?branch=master)](https://coveralls.io/github/sebelga/gstore-node?branch=master)  
gstore-node is a Google Datastore entities modeling library for Node.js inspired by Mongoose and built on top of the **[google-cloud-node](https://github.com/GoogleCloudPlatform/google-cloud-node)** library.

Its main features are:

- explicit **Schema declaration** for entities
- properties **type validation**
- properties **value validation**
- **shortcuts** queries
- pre & post **middleware** (hooks)
- **custom methods** on entity instances

This library is in active development, please report any issue you might find.

:new: gstore supports **Promises**! (> v0.8.0)

----------

<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->
**Table of Contents**  *generated with [DocToc](https://github.com/thlorenz/doctoc)*

- [Motivation](#motivation)
- [Installation](#installation)
  - [Getting started](#getting-started)
    - [Aliases](#aliases)
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
    - [required](#required)
  - [Schema options](#schema-options)
    - [validateBeforeSave (default true)](#validatebeforesave-default-true)
    - [explicitOnly (default true)](#explicitonly-default-true)
    - [queries config](#queries-config)
  - [Schema methods](#schema-methods)
    - [path()](#path)
    - [virtual()](#virtual)
  - [Custom Methods](#custom-methods)
- [Model](#model)
  - [Creation](#creation-1)
  - [Methods](#methods)
    - [Get()](#get)
    - [Update()](#update)
    - [Delete()](#delete)
    - [Other methods](#other-methods)
      - [excludeFromIndexes()](#excludefromindexes)
      - [sanitize()](#sanitize)
      - [key()](#key)
- [Entity](#entity)
  - [Instantiate](#instantiate)
    - [id parameter (optional)](#id-parameter-optional)
    - [ancestors parameter (optional)](#ancestors-parameter-optional)
    - [namespace parameter (optional)](#namespace-parameter-optional)
  - [Properties](#properties)
  - [Methods](#methods-1)
    - [Save()](#save)
    - [Other methods](#other-methods-1)
      - [plain(options)](#plainoptions)
      - [get(path)](#getpath)
      - [set(path, value)](#setpath-value)
      - [model()](#model)
      - [datastoreEntity()](#datastoreentity)
      - [validate()](#validate)
- [Queries](#queries)
  - [gcloud queries](#gcloud-queries)
  - [list()](#list)
  - [findOne()](#findone)
  - [findAround()](#findaround)
  - [deleteAll()](#deleteall)
- [Middleware (Hooks)](#middleware-hooks)
  - [Pre hooks](#pre-hooks)
  - [Post hooks](#post-hooks)
  - [Transactions and Hooks](#transactions-and-hooks)
- [Credits](#credits)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

## Motivation
The Google Datastore is an amazing fast, reliable and flexible database for today's modern apps. But it's flexibility and *schemaless* nature can
sometimes lead to a lot of duplicate code to **validate** the properties passed and their values. The **pre & post 'hooks'** found in Mongoose are also
 of great value when it comes to work with entities on a NoSQL database. As it is built on top of the great gcloud-node library, all of its API can still be
 accessed whenever needed.

## Installation
 ```sh
 npm install gstore-node --save
 ```

### Getting started
For info on how to configure the gcloud datastore [read the docs here](https://googlecloudplatform.github.io/google-cloud-node/#/docs/datastore/0.5.0/datastore).

```js
var datastore = require('@google-cloud/datastore')();
var gstore = require('gstore-node');

gstore.connect(datastore);
```

#### Aliases

After a successful connection, gstore has 2 aliases set up

- `gstore.ds` The gcloud datastore instance
- `gstore.transaction`. Alias of the same gcloud method

## Schema
### Creation
```js
var gstore = require('gstore-node');
var Schema = gstore.Schema;

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
- 'geoPoint' —> gcloud.datastore.geoPoint or an object with 2 props: { longitude: ..., latitude: ... }
- 'buffer' —> Buffer

```js
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
gstore uses the great validator library (https://github.com/chriso/validator.js) to validate input values so you can use any of the validations from that library.

```js
var entitySchema = new Schema({
    email  : {validate: 'isEmail'},
    website: {validate: 'isURL'},
    color  : {validate: 'isHexColor'},
    ...
});
```

You can also define an **Array of valid values** for a properties.  
If you then try to save an entity with a different value it won't validate and won't be saved in the Datastore.

```js
var entitySchema = new Schema({
    color  : {values: ['#ffffff', '#ff6000', '#000000'},
    ...
});
```

### Other properties options
#### optional
By default if a property value is not defined it will be set to null or to its default value (if any). If you don't want this behaviour you can set it as *optional* and if no value is passed, this property will not be saved in the Datastore.

#### default
You can set a default value for the properties.

If you need to set the default value for a **datetime** property to the **current time of the request** there is a special default value for that. `gstore.defaultValues.NOW` 

```
var schema = new Schema({
	createdOn : {type: 'datetime', default: gstore.defaultValues.NOW}
});
```

#### excludeFromIndexes
By default all properties are **included** in the Datastore indexes. If you don't want some properties to be indexed set their 'excludeFromIndexes' property
to true.

<a name="schemaPropertyOptionRead"></a>
#### read
If you don't want certain properties to show up in the result of queries (with *simplifyResult* set to true) or when calling entity.plain(), set this property option to **false**. This is useful when you need to have entity properties only visible to your business logic and not exposed publicly.

This setting can be overridden by passing a *readAll* setting set to **true** in:

- entity.**plain**({readAll:true});
- **globally** in list() and a Schema *queries* settings
- **inline** settings of list(), query() and findAround()

#### write
If you want to protect certain properties to be written by a user, you can set their *write* option to **false**. You can then call [sanitize()](#modelSanitize) on a Model passing the user data and those properties will be removed.   

```
	// Schema:
	var schema = new Schema({
		...
		protectedProp: { write: false }
	});
	
	// In a Controller request:
	var data = req.body; // {name: 'John', lastname: 'Snow', protectedProp: 1234};
	
	// Sanitize incoming user data
	data = BlogPostModel.sanitize(data);
	console.log(data); // {name: 'John', lastname: 'Snow'};

```

#### required
If you want define a mandatory property, set its **required** value to true. If then the property value is *undefined*, *null* or an *empty string* it will not validate and will not be saved in the Datastore.

```js
	// Schema:
	var userSchema = new Schema({
		name: {type: 'string'}
		email: {type: 'string',  validate: 'isEmail', required: true}
	});
	
	// In a Controller request:
	var data = req.body; // {name: 'John'}; // ---> email is missing
	
	var user = new User(data);
	user.save(function(err) {
		--> error will be a ValidatorError
	});
```


Complete properties options example:

```js
var entitySchema = new Schema({
    name:  {type: 'string'},
    lastname:  {excludeFromIndexes: true},
    email: {validate: 'isEmail', required: true},
    website :  {validate: 'isURL', optional: true},
    modified:  {type: 'boolean', default: false, read:false}, // won't show up in queries
    createdOn: {type:'datetime', default: gstore.defaultValues.NOW, write:false} //will be removed from data on sanitize(data)
    ...
});
```

### Schema options
<a name="validateBeforeSave"></a>
#### validateBeforeSave (default true)
To disable any validation before save/update, set it to false

#### explicitOnly (default true)
To allow unregistered properties on a schema set `explicitOnly : false`. This will bring back the magic of *Schemaless* databases. The properties explicitly declared will still be validated.

<a name="simplifyResultExplained"></a>
#### queries config
**readAll** (default false)
Override the Schema option property '**read**' ([see above](#schemaPropertyOptionRead)) to return all the properties of the entities.

**format** (default gstore.Queries.formats.JSON)  
By default queries will return Json plain *objects* with just the entity data + an "id" property added automatically. If you prefer you can have entities gstore instances returned (on which you will be able to call all the methods like "save()", ...).  
The response format can be set here globally but this setting can be overriden on any query (see below).  
Valid values are:  

-  gstore.Queries.formats.JSON (default)
-  gstore.Queries.formats.ENTITY


```js
// Schema options example

var entitySchema = new Schema({
    name : {type: 'string'}
}, {
    validateBeforeSave : false,
    explicitOnly : false,
    queries : {
        readAll : true,
        format: gstore.Queries.formats.ENTITY
    }
});
```

### Schema methods
#### path()
Getter / Setter for schemas paths.

```js
var mySchema = new Schema({name:{type:'string'});

// Getter
mySchema.path('name'); // returns {type:'string'}

// Setter
mySchema.path('email', {type:'string', validate :'isEmail'});

// From a Model
var User = gstore.model('User');

// add new path to User Schema
User.schema.path('age', {type:'number'});

```

#### virtual()

Virtuals are properties that are added to the entities at runtime that are not persisted in the Datastore. You can both define a **getter** and a **setter**.

**getter**

```js
var schema = new Schema({
	firstname: {},
	lastname : {}
});

schema.virtual('fullname').get(function() {
	// the scope (this) is the entityData object

	return this.firstname + ' ' + this.lastname;
});

var User = gstore.model('User', schema);

var user   = new User({firstname:'John', lastname:'Snow'});
console.log(user.fullname); // 'John Snow';

/*
* You can also set virtuals to true in plain method to add them to your output object.
*/
var output = user.plain({virtuals:true});

console.log(output.fullname); // 'John Snow';

```

**setter**

```js
var schema = new Schema({
	firstname: {},
	lastname : {}
});

schema.virtual('fullname').set(function(name) {
	var split      = name.split(' ');
	this.firstname = split[0];
	this.lastname  = split[1];
});

var User = gstore.model('User', schema);

var user = new User();
user.set('fullname', 'John Snow');

console.log(user.get('firstname')); // 'John';
console.log(user.get('lastname')); // 'Snow';

// You can save this entity without problem as virtuals are removed from the entity data before saving
user.save(function() {...});

```

### Custom Methods
Custom methods can be attached to entities instances through their Schemas.  

`schema.methods.methodName = function(){}`

```js
var blogPostSchema = new Schema({title:{}});

// Custom method to retrieve all children Text entities
blogPostSchema.methods.texts = function(cb) {
	var query = this.model('Text')
						.query()
						.hasAncestor(this.entityKey);

	query.run(function(err, result){
		if (err) {
			return cb(err);
		}
		cb(null, result.entities);
	});
};

...

// You can then call it on an entity instance of BlogPost
BlogPost.get(123).then((data) => {
	const blogEntity = data[0];
	blogEntity.texts(function(err, texts) {
	    console.log(texts); // texts entities;
	});
});
```

Note how entities instances can access other models through `entity.model('OtherModel')`. *Denormalization* can then easily be done with a custom method:

```js
// Add custom "getImage()" method on the User Schema
userSchema.methods.getImage = function(cb) {
    // Any type of query can be done here
    // note this.get('imageIdx') could also be accessed by virtual property: this.imageIdx
    return this.model('Image').get(this.get('imageIdx'), cb);
};
...
// In your controller
var user = new User({name:'John', imageIdx:1234});

// Call custom Method 'getImage'
user.getImage(function(err, imageEntity) {
    user.profilePict = imageEntity.get('url');
    user.save().then(() { ... });
});

// Or with Promises
userSchema.methods.getImage = function() {
    return this.model('Image').get(this.imageIdx);
};
...
var user = new User({name:'John', imageIdx:1234});
user.getImage().then((data) => {
	const imageEntity = data[0];
    ...
});
```



## Model
### Creation

```js
var gstore = require('gstore-node');
var Schema = gstore.Schema;

var userSchema = new Schema({
    name:{},
    lastname:{},
    email:{}
});

var User = gstore.model('User', userSchema);
```

----------

### Methods
#### Get()
Retrieving an entity by key is the fastest way to read from the Datastore.
This method accepts the following parameters:

- id {int, string} (can also be an **array** of ids to retrieve)
- ancestors {Array} (optional)
- namespace (optional)
- transaction (optional)
- options (optional)
- callback (optional, if not passed a **Promise** is returned)

Returns ---> an entity **instance**.

```js
var blogPostSchema = new gstore.Schema({...});
var BlogPost       = gstore.model('BlogPost', blogPostSchema);

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

```js
BlogPost.get(123, function(err, entity) {
    if (err) { // deal with err }
    console.log(entity.plain());
});
```

If you need to retrieve an entity from inside a transaction, pass it as fourth parameter.

```js
var error;

var transaction = gstore.transaction();

transaction.run(function(err) {
    if (err) {
        // handle error
        return;
    }

    BlogPost.get(123, null, null, transaction, function(err, entity) {
        if (err) {... deal with error }

        // entity is an instance of the BlogPost model with all its properties & methods

        transaction.commit(function(err) {
            if (err) {
                // transaction will be automatically rolled back on failure
                // handle error
            }
        });
    });
});
```

If no callback is passed, it will return a Promise

```js
BlogPost.get(123).then((data) => {
	const entity = data[0];
	console.log(entity.plain());
});
```

**options** parameter  
The options object parameter has a **preserveOrder** property (default to false). Useful when an array of IDs is passed and you want to preserve the order of those ids in the results. 

```js
BlogPost.get([1,2,3], null, null, null, {preserveOrder:true}, function(err, entities) {
    if (err) { // deal with err }

    // Order is preserved
    console.log(entities[0].entityKey.id); // 1
    console.log(entities[1].entityKey.id); // 2
    console.log(entities[2].entityKey.id); // 3
});
```

**Note**: setting this property to true does take some processing, especially for large sets. Only use it if you absolutely need to maintain the original order passed.

#### Update()
To update a Model, call `Model.update(...args);`
This will get the entity from the Datastore, update its data with the ones passed and save it back to the Datastore (after validating the data).
The update() method has the following parameters

- id : the id of the entity to update
- data : the data to save
- ancestors (optional) : an array of ancestors path
- namespace (optional)
- transaction (optional)
- options (optional)
- callback (optional, if not passed a **Promise** is returned)

Returns ---> an entity **instance**.

```js
// ...

var BlogPost = gstore.model('BlogPost');

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
var transaction = gstore.transaction();

transaction.run(function(err) {
    if (err) {
        // handle error
        return;
    }

    BlogPost.update(123, data, null, null, transaction);

    transaction.commit(function(err) {
        if (err) {
            // handle error
        }
    });
});

```

**replace** property (options)
The options parameter has a **replace** property (default to false) that you can set to true if you want to replace all the entity data. By default, Model.update() does 2 operations inside a **Transaction**:

- first a get() + merges the new data passed in the entity fetched
- then a save()

If just want to override the entity data without doing any merge with the data stored the Datastore, pass replace:true in the options parameter.

```js
BlogPost.update(123, data, null, null, null, {replace:true}, function(err, entity) {
	...
});
```

If no callback is passed, it will return a Promise

```js
BlogPost.update(123, data).then((data) => {
    const entity = data[0];
    console.log(entity.plain());
});
```

#### Delete()
You can delete an entity by calling `Model.delete(...args)`.  
This method accepts the following parameters

- id : the id to delete. Can also be an **array** of ids
- ancestors (optional)
- namespace (optional)
- transaction (optional)
- key (optional) Can also be an **array** of keys
- callback (optional, if not passed a **Promise** is returned)


The response of the callback has a "success" properties that is set to true if an entity has been deleted or false if not.

```js
var BlogPost = gstore.model('BlogPost');

BlogPost.delete(123, function(err, response) {
    if (err) {
        // deal with err
    }
    if (!response.success) {
        console.log('No entity deleted. The id provided didn\'t return any entity');
    }
    
    // The response has a *key* property with the entity keys that have been deleted (single or Array)
});

// With an array of ids
BlogPost.delete([123, 456, 789], function(err, success, apiResponse) {...}

// With ancestors and a namespace
BlogPost.delete(123, ['Parent', 123], 'dev.namespace.com', function(err, success, apiResponse) {...}

// With a key (can also be an <Array> of keys)
BlogPost.delete(null, null, null, null, key, function(err, success, apiResponse) {...}


// Transaction
// -----------
/* The same method can be executed inside a transaction
 * Important!: if you have "pre" middelware set fot delete, then you must *resolve*
 * the Promise before commiting the transaction
*/

var transaction = gstore.transaction();

transaction.run(function(err) {
    if (err) {
        // handle error
        return;
    }
		
	// example 1 (in sync when there are no "pre" middleware)
	BlogPost.delete(123, null, null, transaction); 
	
	transaction.commit(function(err) {
        if (err) {
            // handle error
        }
	});
	
   // example 2 (with "pre" middleware to execute first) 
   BlogPost.delete(123, null, null, transaction)
   				.then(() => {
    				 transaction.commit(function(err) {
				        if (err) {
				            // handle error
				        }
				    });
    			});
});

```

----

#### Other methods
##### excludeFromIndexes()
On Schemaless Models (explicityOnly setting set to false), all the properties not declared explicitly will automatically be added to Google Datastore indexes. If you don't want this behaviour you can call `Model.excludeFromIndexes(property)` passing a **string** property or an **array** of properties. If one of the property passed is already declared on the Schema, this method will set its excludeFromIndexes value to false.

```js
var blogPostSchema = new Schema({
    title: {type:'string'}
}, {explicitOnly:false});

BlogPostModel = gstore.model('BlogPost', blogPostSchema);

...

var blogPost = new BlogPost({
    title:'my-title',
    text:'some very long text that can not be indexed because of the limitation of the Datastore'});

/*
If you save this entity, the text won't be saved in the Datastore
because of the size limitation of the indexes (can't be more tha 1500 bytes).
Assuming that the text propery is dynamic and is not known at Schema instantiation,
you need to remove "text" propery from indexes.
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

```js
var userSchema = new Schema({
    name : {type:'string'},
    createdOn : {type:'datetime', write:false}
});

...
// in your Controller

var data = req.body; // body request
console.log(data.createdOn); // '2016-03-01T21:30:00';
console.log(data.lastname); // "null";

data = UserModel.sanitize(data);
console.log(data.createdOn); // undefined
console.log(data.lastname); // null


```

##### key()
Create entity Key(s). This method accepts the following arguments:

- id (one or several in an Array)
- ancestors (optional)
- namespace (optional)

```js
var User = gstore.model('User');

var entityKey = User.key(123);

// with ancestors and namespace
var entityKey = User.key(123, ['Parent', 'keyname'], 'dev.domain.com');

// passing array of ids

var entityKeys = User.key([123, 456]);
console.log(entityKeys.length); // 2

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

```js
...
// String id
var blogPost = new BlogPost(data, 'stringId');

// Integer ir
var blogPost = new BlogPost(data, 1234);
```

#### ancestors parameter (optional)
Array of an ancestor's path.

```js
// Auto generated id on an ancestor
var blogPost = new BlogPost(data, null, ['Parent', 'keyname']);

// Manual id on an ancestor
var blogPost = new BlogPost(data, 1234, ['Parent', 'keyname']);
```

#### namespace parameter (optional)
By default entities keys are generated with the default namespace (defined when setting up the datastore instance). You can create models instances on
another namespace by passing it as a third parameter.

```js
// Creates an entity with auto-generated id on the namespace "dev-com.my-domain"
var blogPost = new BlogPost(data, null, null, 'dev-com.my-domain');
```

### Properties

- **entityData**. The properties data of the entity.
- **entityKey**. The entity key saved in the Datastore.

Based on the definition of the schema, virtual properties are automatically added on the Entity objects to retrieve the values from the entityData directly.
This means there are two ways you can access the data of an Entity: via entity.entityData or direct on entity itself. For example:

```js
var gstore = require('gstore-node');

var blogPostSchema = new gstore.Schema({
    title :     {type:'string'},
    createdOn : {type:'datetime', default:new Date()}
});

var BlogPost = gstore.model('BlogPost', blogPostSchema);

var data = {
    title : 'My first blog post'
};
var blogPostEntity = new BlogPost(data);

// Logs the same value 'My first blog post'
console.log(blogPostEntity.title);
console.log(blogPostEntity.entityData.title);

blogPostEntity.title = 'My second blog post'; // blogPostEntity.entityData.title is also changed
blogPostEntity.entityData.title = 'My third blog post'; // blogPostEntity.title is also changed
```

### Methods

#### Save()

After the instantiation of a Model, you can persist its data to the Datastore with `entity.save(...args)`  
This method accepts the following parameters

- transaction (optional). Will execute the save operation inside this transaction
- callback (optional, if not passed a **Promise** is returned)


```js
var gstore = require('gstore-node');

var blogPostSchema = new gstore.Schema({
    title :     {type:'string'},
    createdOn : {type:'datetime', default:new Date()}
});

var BlogPost = gstore.model('BlogPost', blogPostSchema);

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
var user = new User({name:'john'});
var transaction = gstore.transaction();

transaction.run().then(() => {
	
	// See note below to avoid nesting Promises
   return user.save(transaction).then(() => {
    	return transaction.commit().then((data) => {
    		const apiResponse = data[0];
    		...
    	});
    });
}).catch((err) => {
	// handle error
   ...
 });

```

Note on **saving inside a Transaction**  
By default, the entity data is validated before being saved in the Datastore (you can desactivate this behavious by setting [validateBeforeSave](#validateBeforeSave) to false in the Schema definition). The validation middleware is async, which means that to be able to save inside a transaction and at the same time validate before, you need to resolve the *save* method before being able to commit the transaction.  
A solution to avoid this is to **manually validate** before saving and then desactivate the "pre" middelwares by setting **preHooksEnabled** to false on the entity.  
**Important**: This solution will bypass any other middleware that you might have defined on "save" in your Schema.

```js
var user = new User({name:'john'});
var transaction = gstore.transaction();

transaction.run().then() => {
	User.get(123, null, null, transaction).then((data) => {
		const user = data[0];
		user.email = 'abc@def.com';
		const valid = user.validate();
		
		if (!valid) {
		    // exit the transaction;
		}
		
		// disable pre middleware(s)
		user.preHooksEnabled = false;
		
		// save inside transaction
		user.save(transaction);

		// ... more transaction operations
		
		transaction.commit().then(() => {
		    ...
		});
	});
});
```


#### Other methods

<a name="entityPlain"></a>
##### plain(options)
This methods returns the entity **data** and its entity key **id** (int or string)

The options has 2 properties that you can set:

- readAll (default false) // to output all the properties regardless of a schema "read" property setting
- virtuals (default false) // to add virtuals to the output object


##### get(path)
Get the value of an entity data at a specific path

```js
user = new User({name:'John'});
user.get('name'); // John
```

##### set(path, value)
Set the value of an entity data at a specific path

```js
user = new User({name:'John'});
user.set('name', 'Mike');
user.get('name'); // Mike
```

##### model()
Get an entity Model from entity instance.

```js
var UserModel = gstore.model('User');


// Ex: on a schema 'pre' save hook
commentSchema.pre('save', function(next){
	var User = this.model('User');
	console.log(User === UserModel); // true
});
```


##### datastoreEntity()

In case you need at any moment to fetch the entity **data** from Goolge Datastore, this method will do just that right on the entity instance.

```js
var user = new User({name:'John'});

user.save(function(err) {
	// the scope *this* is a gstore entity instance of a User Model

	this.datastoreEntity(function(err, entity){
		console.log(entity.get('name')); // 'John'
	});
});

// or with a Promise...
user.save().then(function() {
	this.datastoreEntity().then((data){
		const entity = data[0];
		console.log(entity.name); // 'John'
	});
});

```

##### validate()
This methods validates an entity data. Return true if valid, false otherwise.

```js
var schema = new Schema({name:{}});
var User   = gstore.model('User', schema);

var user  = new User({name:'John', lastname:'Snow'});
var valid = user.validate();

console.log(valid); // false
```


----------

## Queries
### gcloud queries

gstore is built on top of [gcloud-node](https://googlecloudplatform.github.io/gcloud-node/#/docs/v0.37.0/datastore/query) so you can execute any query from this library.  

You **first** create the query with "<Model>.query()" then chain all the operators.  **Then** you call query.run() to execute the query.  
Query.run() has an **optional** parameters to pass 2 settings: "readAll" and "format".

```
/**
 * readAll:
 * If you set it to true, all the properties will be returned regardless of the "read"
 * setting defined on the Schema
 *
 * format: 
 * Response format, either plain object (default) or entity instances
*/

{
    readAll: true | false
    format : gstore.Queries.formats.JSON | gstore.Queries.formats.ENTITY
}
```

```js
var User = gstore.model('User'); // with User schema previously defined

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

// Example with an options parameter
query.run({ readAll:true, format: gstore.Queries.formats.ENTITY })
	 .then( ... );

```

**namespace**  
Model.query() takes an optional namespace parameter if needed.

```js
var query = User.query('com.domain-dev')
                .filter('name', '=', 'John');
...
```

If no callback is passed, a **Promise** is returned

```js
var query = User.query()
            .filter('name', '=', 'John');

query.run().then((result) => {
    const response = result[0];

    // response contains both the entities and a nextPageCursor for pagination
    var entities       = response.entities;
    var nextPageCursor = response.nextPageCursor; // not present if no more results
});
```

### list()
Shortcut for listing the entities. For complete control (pagination, start, end...) use the above gcloud queries. List queries are meant to quickly list entities with predefined settings.

Currently it support the following queries parameters

- limit
- order
- select
- ancestors
- filters (default operator is "=" and does not need to be passed)
- start


**1. Define on Schema**

`entitySchema.queries('list', {...settings});`

Example

```js
// Create Schema
var blogPostSchema = new gstore.Schema({
    title : {type:'string'},
    isDraft: {type: 'boolean'}
});

// List settings
var querySettings = {
    limit    : 10,
    order    : {property: 'title', descending:true}, // descending defaults to false and is optional
    select   : 'title',
    ancestors: ['Parent', 123],  // will add an "hasAncestor" filter
    filters  : ['isDraft', false] // operator defaults to "=",
    start    : 'nextPageCursorFromPreviousQuery' // from a previous query
};

// Add to schema
blogPostSchema.queries('list', querySettings);

// Create Model
var BlogPost = gstore.model('BlogPost', blogPostSchema);
```

**2. Use anywhere**

`Model.list(callback)`
The **response** object in the callback contains both the **entities** and a **nextPageCursor** for pagination (to be used in a next `Model.list({start:pageCursor}, function(){...}` call)

```js
// In your Controllers
BlogPost.list(function(err, response) {
    if (err) {
        // deal with err
    }
    console.log(response.entities);
    console.log(response.nextPageCursor); // only present if more results
});
```

Order, Select & filters can also be **arrays** of settings

```js
var querySettings = {
    orders  : [{property: 'title'}, {property:'createdOn', descending:true}]
    select  : ['title', 'createdOn'],
    filters : [['title', 'My first post'], ['createdOn', '<',  new Date()]]
};
```

The **value** of a filter can also be a function that **returns** a value. This function will be executed on on each request. Usefull for dynamic value like retrieving the current date.

```js
var querySettings = {
	filters : ['publishOn', '<', () => new Date()],
	...
}

// In a Controller request
BlogPost.list(function(err, response) {
	// --> will return all BlogPost with a publishOn property date previous of today's date.
});
```

**Override settings**  
These global settings defined on the schema can be overridden anytime by passing new settings as first parameter. `Model.list(settings, cb)`

```js
var newSettings = {
    limit : 20,
    start : 'pageCursor'
};

BlogPost.list(newSettings, function(err, entities) {
    if (err) {
        // deal with err
    }
    console.log(entities);
});
```

**Additional settings** in override

- namespace {string}
- readAll {boolean} true | false
- format {string} gstore.Queries.formats.JSON (default) | gstore.Queries.formats.ENTITY

Use the **namespace** setting to override the default namespace.

```js
var newSettings = {
    ...
    namespace:'com.domain-dev',
    readAll: true,
    format: gstore.Queries.formats.ENTITY
};

BlogPost.list(newSettings, ...);
```

If no callback is passed, a **Promise** is returned

```js
BlogPost.list(/*settings*/).then((data) => {
	const entities = data[0];
    console.log(entities);
});
```


### findOne()
```js
User.findOne({prop1:value, prop2:value2}, ancestors /*optional*/, namespace /*optional*/, callback);
```

Quickly find an entity by passing key/value pairs. You can optionally pass an ancestors array or a namespace.
The entity returned is a entity **instance** of the Model.

```js
var User = gstore.model('User');

User.findOne({email:'john@snow.com'}, function(err, entity) {
    if (err) {... deal with error}

    console.log(entity.plain());
    console.log(entity.get('name'));
});

```

If no callback is passed, a **Promise** is returned

```js
User.findOne({email:'john@snow.com'}).then((data) => {
	const entity = data[0];

    console.log(entity.plain());
    console.log(entity.get('name')); // or directly entity.name;
});
```

### findAround()
`Model.findAround(property, value, settings, callback)`

Find entities before or after an entity based on a property and a value.
**settings** is an object that contains *either* "before" or "after" with the number of entities to retreive.

```js
// Find the next 20 post after march 1st
BlogPost.findAround('publishedOn', '2016-03-01', {after:20}, function(err, entities){
   ...
});

// Find 10 users before Mick Jagger
User.findAround('lastname', 'Jagger', {before:10}, function(err, entities){
   ...
});

```

If no callback is passed, a **Promise** is returned

```js
BlogPost.findAround('publishedOn', '2016-03-01', {after:20}).then((data) => {
	const entities = data[0];
   ...
});
```

**Additional settings**

- readAll {boolean} true | false
- format {string} gstore.Queries.formats.JSON (default) | gstore.Queries.formats.ENTITY

```js
BlogPost.findAround('publishedOn',
						'2016-03-01',
						{after:20, readAll: true, format: gstore.Queries.formats.ENTITY})
		.then((data) => {
			const entities = data[0];
		   ...
		});
```


### deleteAll()
```js
BlogPost.deleteAll(ancestors /*optional*/, namespace /*optional*/, callback)
```
If you need to delete all the entities of a certain kind, this shortcut query will do just that.

```js
BlogPost.deleteAll(function(err, result){
    if (err) {// deal with err}

    console.log(result.message);
});

// With ancestors path and namespace
BlogPost.deleteAll(['Grandpa', 1234, 'Dad', 'keyname'], 'com.new-domain.dev', function(err) {...});
```

If no callback is passed, a **Promise** is returned

```js
BlogPost.deleteAll(['Grandpa', 1234, 'Dad', 'keyname'], 'com.new-domain.dev').then(() => {
	...
});
```

## Middleware (Hooks)
Middleware or 'Hooks' are functions that are executed right before or right after a specific action on an entity.  
Hooks are available for the following methods

- Entity.save() (also executed on Model.**update()**)
- Model.delete()
- Model.findOne()
- On your custom methods

:exclamation: Breaking change since v0.8.0. Your hooks must return a Promise **and** you must use the new "Promise" version of the methods (=> not passing a callback). 

### Pre hooks
The middleware that you declare receives the original parameter(s) passed to the method. You can modify them in your **resolve** passing an object with an **__override** property containing the new parameter(s) for the target method (be careful though... with great power comes great responsibility!).  See example below.  
If you **reject** the Promise in a "pre" middleware, the target function is not executed.

A common use case would be to hash a user's password before saving it into the Datastore.

```js
...

var bscrypt = require('bcrypt-nodejs');

var userSchema = new Schema({
    user :     {'string'},
    email :    {'string', validate:'isEmail'},
    password : {'string', excludeFromIndexes: true}
});

userSchema.pre('save', hashPassword);

function hashPassword() {
	// scope *this* is the entity instance
    var _this    = this;
    var password = this.get('password'); // or this.password (virtual property)

    if (!password) {
        // nothing to hash... exit
        return Promise.resolve();
    }
    
    return new Promise((resolve, reject) => {
		bcrypt.genSalt(5, function (err, salt) {
			if (err) {
				return reject(err);
			};
			bcrypt.hash(password, salt, null, function (err, hash) {
				if (err) {
					return reject(err);
				};
			 	_this.set('password', hash); // or _this.password = hash;
				return resolve();
			});
		});
    });
}

...

// Then when you create a new user and save it (or when updating it)
// the password will automatically be hashed

var User = gstore.model('User');
var user = new User({username:'john', password:'mypassword'});

user.save(function(err, entity) {
    console.log(entity.get('password'));
    // $7a$01$Gd/7OGVnMyTDnaGC3QfEwuQ1qmjifli3MvjcP7UGFHAe2AuGzne5.
});
```

**Note**
The pre('delete') hook has its scope set on the entity to be deleted. **Except** when an *Array* of ids to delete is passed.

```js
blogSchema.pre('delete', function() {
	console.log(this.entityKey); // the datastore entity key to be deleted

	// By default this.entityData is not present because
	// the entity is *not* fetched from the Datastore.
	// You could call this.datastoreEntity() here (see the Entity section)
	// to fetch the data from the Datastore and do any other logic
	// before resolving your middlewware
	
	// Access arguments passed
	const args = Array.prototype.slice(arguments);
	console.log(args[0]); // 1234 (from call below)
	
	// Here you would override the id to delete! At your own risk...
	// The Array passed in __override are the parameter(s) for the target function
	return Promise.resolve({ __override: [1235] });
});

BlogPost.delete(1234).then(() => {...});
```

You can also pass an **Array** of middleware to execute

```js
function middleware1() {
	// Return a Promise
	return Promise.resolve();
}

function middleware2() {
	return Promise.resolve();
}

userSchema.pre('save', [middleware1, middleware2]);

var user = new User({username:'john', password:'mypassword'});
user.save().then((result) => { ... });
```

### Post hooks
Post are defined the same way as pre hooks. The main difference is that if you reject the Promise because of an error, the original method still resolves but the response is now an object with 2 properties. The **result** and **errorsPostHook** containing possible post hooks error(s).

```js
var schema = new Schema({username:{...}});
schema.post('save', function(){
    var email = this.get('email');
    // do anything needed, maybe send an email of confirmation?
    
    // If there is any error you'll reject your middleware
    return Promise.reject({ code:500, message: 'Houston something went really wrong.' });
});

// ....

var user = new User({ name: 'John' });

user.save().then((data) => {
	// You should only do this check if you have post hooks that can fail
	const entity = data.errorsPostHook ? data[0].result : data[0];
	
	if (data.errorsPostHook) {
		console.log(data.errorsPostHook[0].message); // 'Houston something went really wrong.'
	}
});

```

**Note**
The post('delete') hook does not have its scope mapped to the entity as it is not fetched from the datastore. Althought the *data* argument of the hook contain the key(s) of the entitie(s) deleted.

```js
schema.post('delete', function(data){
	// data[1] can be one Key or an array of entity Keys that have been deleted.
	return Promise.resolve();
});
```

You can also pass an **Array** of middleware to execute

```js
function middleware1() {
	return Promise.resolve();
}

function middleware2() {
	return Promise.resolve();
}

userSchema.post('save', [middleware1, middleware2]);

var user = new User({username:'john', password:'mypassword'});
user.save().then((result) => { ... });
```

### Transactions and Hooks

When you save or delete an entity from inside a transaction, gstore adds an **execPostHooks()** method to the transaction instance.  
If the transaction succeeds and you have any post('save') or post('delete') hooks on any of the entities modified during the transaction you need to call this method to execute them.

```js
var transaction = gstore.transaction();

transaction.run().then(() => {
    var user = new User({name:'john'});
    user.preHooksEnabled = false; // disable "pre" hooks (see entity section)
    user.save(transaction);

    BlogPost.delete(123, null, null, transaction);

    transaction.commit().then((data) => {
        transaction.execPostHooks().then(() => {
            const apiResponse = data[0];
        	  // all done!
        });
    });
});

```

----------

## Global Methods
### save()

gstore has a global method "save" that is an alias of the original Datastore save() method, with the exception that you can pass it an Entity **instance** or an **\<Array\>** of entities instances and it will first convert them to the correct Datastore format before saving.  

**Note**: The entities can be of **any Kind**. You can concat several arrays of queries from different Models and then save them all at once with this method.

```js
const query = BlogModel.query().limit(20);
query.run({ format: gstore.Queries.formats.ENTITY })
	  .then((result) => {
	  	const entities = result[0].entities;
	  	
	  	// entities are gstore instances, you can manipulate them
	  	// and then save them by calling:

	  	gstore.save(entities).then(() => {
	  		...
	  	});
	  })

```



## Credits
I have been heavily inspired by [Mongoose](https://github.com/Automattic/mongoose) to write gstore. Credits to them for the Schema, Model and Entity
definitions, as well as 'hooks', custom methods and other similarities found here.
Not much could neither have been done without the great work of the guys at [gcloud-node](https://github.com/GoogleCloudPlatform/gcloud-node).
