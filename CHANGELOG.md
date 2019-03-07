# Change Log

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

<a name="5.0.2"></a>
## [5.0.2](https://github.com/sebelga/gstore-node/compare/v5.0.1...v5.0.2) (2019-03-07)


### Bug Fixes

* **Entity:** Allow saving an entity that has been populated ([a24c75a](https://github.com/sebelga/gstore-node/commit/a24c75a))
* **model.get():** handle null when entity does not exist ([#152](https://github.com/sebelga/gstore-node/issues/152)) ([21d258f](https://github.com/sebelga/gstore-node/commit/21d258f))
* **Model.update():** fix onUpdateError throwing empty object instead of error ([#153](https://github.com/sebelga/gstore-node/issues/153)) ([b1929c7](https://github.com/sebelga/gstore-node/commit/b1929c7))



<a name="5.0.1"></a>
## [5.0.1](https://github.com/sebelga/gstore-node/compare/v5.0.0...v5.0.1) (2019-02-05)



<a name="5.0.0"></a>
# [5.0.0](https://github.com/sebelga/gstore-node/compare/v4.3.3...v5.0.0) (2019-02-04)


### Bug Fixes

* **Model.update():** Fix bug in Model.update() inside a transaction ([#148](https://github.com/sebelga/gstore-node/issues/148)) ([e4cfaa6](https://github.com/sebelga/gstore-node/commit/e4cfaa6)), closes [#144](https://github.com/sebelga/gstore-node/issues/144)


### Code Refactoring

* Change gstore instantiation to be consistent with es modules ([#149](https://github.com/sebelga/gstore-node/issues/149)) ([3f27d4c](https://github.com/sebelga/gstore-node/commit/3f27d4c))


### Features

* **Populate:** Fetch entities references in Model.get() and queries ([72fff67](https://github.com/sebelga/gstore-node/commit/72fff67))


### BREAKING CHANGES

* The new way to create gstore instances is with "new Gstore(<config>)". Refer to the
documentation.
* **Populate:** Callback (hell) are not supported anymore as the last argument of gstore methods. Only Promises are returned.
* **Populate:** Node runtime must be version 8 or superior
* **Populate:** The old Schema property types "datetime" and "int" have been removed. Date and Number types should be used instead.



<a name="4.3.3"></a>
## [4.3.3](https://github.com/sebelga/gstore-node/compare/v4.3.2...v4.3.3) (2018-12-29)


### Bug Fixes

* **Sanitize:** Remove non writable property on Joi schema ([#140](https://github.com/sebelga/gstore-node/issues/140)) ([4ba1ce6](https://github.com/sebelga/gstore-node/commit/4ba1ce6)), closes [#139](https://github.com/sebelga/gstore-node/issues/139)



<a name="4.3.2"></a>
## [4.3.2](https://github.com/sebelga/gstore-node/compare/v4.3.1...v4.3.2) (2018-12-21)


### Bug Fixes

* Fixes 'exludeFromRead' for nested paths where object does not exist ([f7c336c](https://github.com/sebelga/gstore-node/commit/f7c336c)), closes [#128](https://github.com/sebelga/gstore-node/issues/128)
* **excludeFromRead:** Make sure segment exist before trying to access it when deserializing ([03bcf53](https://github.com/sebelga/gstore-node/commit/03bcf53))
* **Model:** Update validate() to not sanitize prop where write is set to false ([#138](https://github.com/sebelga/gstore-node/issues/138)) ([e86a875](https://github.com/sebelga/gstore-node/commit/e86a875))



<a name="4.3.1"></a>
## [4.3.1](https://github.com/sebelga/gstore-node/compare/v4.3.0...v4.3.1) (2018-11-13)


### Bug Fixes

* **Model:** Modify validate() method to update entityData on validation ([98dab4b](https://github.com/sebelga/gstore-node/commit/98dab4b))
* **Model:** Preserve gstore KEY on entityData when validating Joi Schema ([f86dbcb](https://github.com/sebelga/gstore-node/commit/f86dbcb))



<a name="4.3.0"></a>
# [4.3.0](https://github.com/sebelga/gstore-node/compare/v4.2.6...v4.3.0) (2018-09-07)


### Bug Fixes

* **entity:** Remove Array wrapping of datastoreEntity() response from cache ([00254d0](https://github.com/sebelga/gstore-node/commit/00254d0))


### Features

* Add global gstore config to return null on entity not found ([6b73631](https://github.com/sebelga/gstore-node/commit/6b73631)), closes [#123](https://github.com/sebelga/gstore-node/issues/123)
* Support "read"-type config for embedded objects ([e3e554f](https://github.com/sebelga/gstore-node/commit/e3e554f)), closes [#122](https://github.com/sebelga/gstore-node/issues/122)



<a name="4.2.6"></a>
## [4.2.6](https://github.com/sebelga/gstore-node/compare/v4.2.5...v4.2.6) (2018-08-26)


### Bug Fixes

* typescript definitions file ([e99125e](https://github.com/sebelga/gstore-node/commit/e99125e))
* typescript definitions file ([399087c](https://github.com/sebelga/gstore-node/commit/399087c))
* **cache:** Throw error when Model.get() returns undefined from cache ([b46758a](https://github.com/sebelga/gstore-node/commit/b46758a)), closes [#119](https://github.com/sebelga/gstore-node/issues/119)



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
