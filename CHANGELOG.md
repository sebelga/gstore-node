# Change Log

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

<a name="4.2.5"></a>
## [4.2.5](https://github.com/sebelga/gstore-node/compare/v4.2.4...v4.2.5) (2018-08-18)


### Bug Fixes

* **cache:** Support nsql-cache 1.1.3 ([31d9767](https://github.com/sebelga/gstore-node/commit/31d9767))
* **tests:** Fix integration tests with Redis cache ([0a0838d](https://github.com/sebelga/gstore-node/commit/0a0838d))



<a name="4.2.4"></a>
## [4.2.4](https://github.com/sebelga/gstore-node/compare/v4.2.3...v4.2.4) (2018-07-30)


### Bug Fixes

* **transaction-post-hooks:** Add missing scope to post hooks inside a transaction ([3fe059d](https://github.com/sebelga/gstore-node/commit/3fe059d)), closes [#115](https://github.com/sebelga/gstore-node/issues/115)



<a name="4.2.3"></a>
## [4.2.3](https://github.com/sebelga/gstore-node/compare/v4.2.2...v4.2.3) (2018-07-22)


### Bug Fixes

* **delete-hooks:** Wrong argument mapping in getScopeForDeleteHooks() ([5c91046](https://github.com/sebelga/gstore-node/commit/5c91046))



<a name="4.2.2"></a>
## [4.2.2](https://github.com/sebelga/gstore-node/compare/v4.2.1...v4.2.2) (2018-07-10)


### Bug Fixes

* **dataloader:** Add maxBatchSize option to limit entities to 1000 ([a7c43e9](https://github.com/sebelga/gstore-node/commit/a7c43e9)), closes [#114](https://github.com/sebelga/gstore-node/issues/114)



<a name="4.2.1"></a>
## [4.2.1](https://github.com/sebelga/gstore-node/compare/v4.2.0...v4.2.1) (2018-05-08)



<a name="4.2.0"></a>
# [4.2.0](https://github.com/sebelga/gstore-node/compare/v4.1.1...v4.2.0) (2018-05-08)


### Features

* **global-save:** Add option to validate entity before saving in gstore.save() method ([39ccb9c](https://github.com/sebelga/gstore-node/commit/39ccb9c)), closes [#103](https://github.com/sebelga/gstore-node/issues/103)
* **gstore-save:** Add save method to global save ([9908d7c](https://github.com/sebelga/gstore-node/commit/9908d7c)), closes [#105](https://github.com/sebelga/gstore-node/issues/105)
* **virtual properties:** Access and update virtuals properties directly on the entity instance ([b079f7e](https://github.com/sebelga/gstore-node/commit/b079f7e)), closes [#102](https://github.com/sebelga/gstore-node/issues/102)



<a name="4.1.1"></a>
## [4.1.1](https://github.com/sebelga/gstore-node/compare/v4.1.0...v4.1.1) (2018-04-11)


### Bug Fixes

* **typings:** Add missing generics to Schema in Model creation ([f3cc4b4](https://github.com/sebelga/gstore-node/commit/f3cc4b4))



<a name="4.1.0"></a>
# [4.1.0](https://github.com/sebelga/gstore-node/compare/v4.0.0...v4.1.0) (2018-04-11)


### Bug Fixes

* **queries:** Allow namespace to be set in "list" queries options ([ea5326e](https://github.com/sebelga/gstore-node/commit/ea5326e))
* **queries:** Forward options object to Datastore Query ([2eb0f3f](https://github.com/sebelga/gstore-node/commit/2eb0f3f))


### Features

* **hooks:** Model.delete() "post" hooks callback have now their scope on the entity instance delete ([4d9b4dd](https://github.com/sebelga/gstore-node/commit/4d9b4dd))
* **Schema:** Set new types for Schema definition ([ad51508](https://github.com/sebelga/gstore-node/commit/ad51508))
* **Typescript:** Add Typescript support ([351538b](https://github.com/sebelga/gstore-node/commit/351538b))



<a name="4.0.0"></a>
# [4.0.0](https://github.com/sebelga/gstore-node/compare/v3.0.1...v4.0.0) (2018-03-19)


### Code Refactoring

* **error handling:** Set error code when entity not found in entity.datastoreEntity() method ([03cfd7b](https://github.com/sebelga/gstore-node/commit/03cfd7b))


### Features

* **cache:** Add cache layer to entity.datastoreEntity() method ([63780e4](https://github.com/sebelga/gstore-node/commit/63780e4))


### BREAKING CHANGES

* **error handling:** The error code when the entity is not found has been changed from "404" to the
"gstore.errors.code.ERR_ENTITY_NOT_FOUND" code
