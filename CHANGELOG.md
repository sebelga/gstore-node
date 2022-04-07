# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

## [8.0.0](https://github.com/sebelga/gstore-node/compare/v7.2.8...v8.0.0) (2022-04-07)

### ⚠ BREAKING CHANGES

- **datastore.ts:** Entity keys return ids as Number

### Bug Fixes

- **datastore.ts:** ensure entities with id based keys are correcly loaded from cache ([a3a5b33](https://github.com/sebelga/gstore-node/commit/a3a5b3326106017ff4b4fe160c96f7c67cd59162)), closes [#243](https://github.com/sebelga/gstore-node/issues/243)

## [7.2.8](https://github.com/sebelga/gstore-node/compare/v7.2.6...v7.2.8) (2022-04-07)

This release fixes incorrectly published code from v7.2.7

### Bug Fixes

- **src/serializers/datastore.ts:** load cached entities with correct Datastore Key type ([#265](https://github.com/sebelga/gstore-node/issues/265)) ([b06641b](https://github.com/sebelga/gstore-node/commit/b06641bda0e3a910ca76097761d4a93217478401)), closes [#243](https://github.com/sebelga/gstore-node/issues/243)

<a name="7.2.7"></a>

## [7.2.7](https://github.com/sebelga/gstore-node/compare/v7.2.6...v7.2.7) (2022-04-07)

### Bug Fixes

- fix(src/serializers/datastore.ts): load cached entities with correct Datastore Key type (#265) b06641b
- test(integration tests): add integration tests for fineOne and check entityKey construction (#246) b87a275

### Dependency upgrades

- chore(deps): bump validator from 13.0.0 to 13.7.0 (#257) d35f66a
- chore(deps): bump tmpl from 1.0.4 to 1.0.5 (#256) fef76a2
- chore(deps): bump path-parse from 1.0.6 to 1.0.7 (#255) 707943e
- chore(deps): bump glob-parent from 5.0.0 to 5.1.2 (#253) 8782798
- chore(deps): bump hosted-git-info from 2.7.1 to 2.8.9 (#251) 4012b03
- chore(deps): bump handlebars from 4.7.6 to 4.7.7 (#250) b75752e
- chore(deps): bump redis from 3.0.2 to 3.1.2 (#249) 3cb6c45
- chore(deps): bump y18n from 4.0.0 to 4.0.1 (#248) 766310d
- chore(deps): bump elliptic from 6.5.3 to 6.5.4 (#247) 5d083f7

### Documentation

- docs(github issue templates): add github issue templates (#245) 605a848

https://github.com/sebelga/gstore-node/compare/v7.2.6...v7.2.7

### [7.2.6](https://github.com/sebelga/gstore-node/compare/v7.2.5...v7.2.6) (2020-12-15)

### [7.2.5](https://github.com/sebelga/gstore-node/compare/v7.2.4...v7.2.5) (2020-05-11)

### Chore

- **Dependencies** Update all dependencies.  
  `gstore-node` has been tested and works with `@google-cloud/datastore` **version 5+**.

### Bug Fixes

- **typings:** Fix passing of generic parameters to Entity ([#221](https://github.com/sebelga/gstore-node/issues/221)) ([dc3fba2](https://github.com/sebelga/gstore-node/commit/dc3fba28bdb942e7abb4fee3727a85948a342112))

### [7.2.4](https://github.com/sebelga/gstore-node/compare/v7.2.3...v7.2.4) (2019-12-10)

### Bug Fixes

- **gstore.save():** update "modifiedOn" property on entities ([#209](https://github.com/sebelga/gstore-node/issues/209)) ([94b74d8](https://github.com/sebelga/gstore-node/commit/94b74d8636d50369ad9aa8468da8241aac9091f5)), closes [#202](https://github.com/sebelga/gstore-node/issues/202)
- **schema.date:** allow valid string Date in validation ([#210](https://github.com/sebelga/gstore-node/issues/210)) ([268c22e](https://github.com/sebelga/gstore-node/commit/268c22e713dba2191ebe26230eeafa0fc241bad1)), closes [#206](https://github.com/sebelga/gstore-node/issues/206)

### [7.2.3](https://github.com/sebelga/gstore-node/compare/v7.2.2...v7.2.3) (2019-10-26)

### Bug Fixes

- **cache:** Get multiple keys ([#198](https://github.com/sebelga/gstore-node/issues/198)) ([0ec188d](https://github.com/sebelga/gstore-node/commit/0ec188d)), closes [#187](https://github.com/sebelga/gstore-node/issues/187)
- **findOne:** add missing `readAll` option ([#200](https://github.com/sebelga/gstore-node/issues/200)) ([8e19a15](https://github.com/sebelga/gstore-node/commit/8e19a15))

### [7.2.2](https://github.com/sebelga/gstore-node/compare/v7.2.1...v7.2.2) (2019-10-01)

### Bug Fixes

- **typings:** add Methods generic to Model<T, M> ([7c3e5b0](https://github.com/sebelga/gstore-node/commit/7c3e5b0))
- **Typings:** Add generic types to Entity, Model & Schema ([#195](https://github.com/sebelga/gstore-node/issues/195)) ([c939de5](https://github.com/sebelga/gstore-node/commit/c939de5)), closes [#194](https://github.com/sebelga/gstore-node/issues/194)

### [7.2.1](https://github.com/sebelga/gstore-node/compare/v7.2.0...v7.2.1) (2019-09-26)

## [7.2.0](https://github.com/sebelga/gstore-node/compare/v7.1.0...v7.2.0) (2019-09-26)

### Features

- **Typescript:** Improve typings support ([43d9dc2](https://github.com/sebelga/gstore-node/commit/43d9dc2))

## [7.1.0](https://github.com/sebelga/gstore-node/compare/v7.0.0...v7.1.0) (2019-09-13)

### Features

- **auto-unindex:** add Schema option to auto unindex large properties ([#183](https://github.com/sebelga/gstore-node/issues/183)) ([dbf9861](https://github.com/sebelga/gstore-node/commit/dbf9861))

## [7.0.0](https://github.com/sebelga/gstore-node/compare/v6.0.2...v7.0.0) (2019-09-11)

### ⚠ BREAKING CHANGES

- **entitykey:** The "keyType" Schema option has been removed as it is no longer needed. Also, as gstore does not parse the id anymore, running your project against the Datastore emulator locally might break as the emulator treats differently User.get(123) than User.get("123"). Auto-allocated ids are integers and need to be provided as integers for the Emulator.
- **Dependencies:** Node version 8.x not supported anymore. Upgrade to v10.x or superior.
- **Dependencies:** The @google-cloud/datastore package is not defined anymore as a dependency of gstore-node. You will need to manually install it in your project.

- **Dependencies:** Set google-cloud datastore as peerDependency ([#177](https://github.com/sebelga/gstore-node/issues/177)) ([ac52ffb](https://github.com/sebelga/gstore-node/commit/ac52ffb))
- **Dependencies:** Update lib dependencies ([#178](https://github.com/sebelga/gstore-node/issues/178)) ([7fa94b1](https://github.com/sebelga/gstore-node/commit/7fa94b1))

### Bug Fixes

- call execPostHooks on internalTransaction ([#161](https://github.com/sebelga/gstore-node/issues/161)) ([7b132cf](https://github.com/sebelga/gstore-node/commit/7b132cf))
- **entity:** add "id" property to entity after it has been saved ([#180](https://github.com/sebelga/gstore-node/issues/180)) ([15a713a](https://github.com/sebelga/gstore-node/commit/15a713a)), closes [#172](https://github.com/sebelga/gstore-node/issues/172)
- **entitykey:** remove convertion of string number to integer for entity key id ([#179](https://github.com/sebelga/gstore-node/issues/179)) ([75dc869](https://github.com/sebelga/gstore-node/commit/75dc869)), closes [#168](https://github.com/sebelga/gstore-node/issues/168)
- **excludefromindexes:** update logic to add all properties of Array embedded entities ([#182](https://github.com/sebelga/gstore-node/issues/182)) ([c9da35b](https://github.com/sebelga/gstore-node/commit/c9da35b)), closes [#132](https://github.com/sebelga/gstore-node/issues/132)
- **model:** throw NOT_FOUND error when trying to update a Model that does not exist ([#181](https://github.com/sebelga/gstore-node/issues/181)) ([cc11e02](https://github.com/sebelga/gstore-node/commit/cc11e02)), closes [#164](https://github.com/sebelga/gstore-node/issues/164)
- **Types:** Schema methods() signature ([#171](https://github.com/sebelga/gstore-node/issues/171)) ([4a144ce](https://github.com/sebelga/gstore-node/commit/4a144ce))

<a name="6.0.2"></a>

## [6.0.2](https://github.com/sebelga/gstore-node/compare/v6.0.1...v6.0.2) (2019-04-26)

### Bug Fixes

- added default options when Joi is enabled ([528da24](https://github.com/sebelga/gstore-node/commit/528da24))

<a name="6.0.1"></a>

## [6.0.1](https://github.com/sebelga/gstore-node/compare/v6.0.0...v6.0.1) (2019-03-26)

### Bug Fixes

- **Typescript:** Add missing export types ([f91fc39](https://github.com/sebelga/gstore-node/commit/f91fc39))

<a name="6.0.0"></a>

# [6.0.0](https://github.com/sebelga/gstore-node/compare/v5.0.2...v6.0.0) (2019-03-07)

### Bug Fixes

- **Model.get():** Consistently return an Array when providing an array of ids ([#155](https://github.com/sebelga/gstore-node/issues/155)) ([45e68fc](https://github.com/sebelga/gstore-node/commit/45e68fc)), closes [#134](https://github.com/sebelga/gstore-node/issues/134)

### BREAKING CHANGES

- **Model.get():** When an Array of ids is provided to Model.get(), gstore will now consistently return an Array. In earlier versions, if an array of one id was provided, gstore would return a single entity instead of an array containing the entity.

<a name="5.0.2"></a>

## [5.0.2](https://github.com/sebelga/gstore-node/compare/v5.0.1...v5.0.2) (2019-03-07)

### Bug Fixes

- **Entity:** Allow saving an entity that has been populated ([a24c75a](https://github.com/sebelga/gstore-node/commit/a24c75a))
- **model.get():** handle null when entity does not exist ([#152](https://github.com/sebelga/gstore-node/issues/152)) ([21d258f](https://github.com/sebelga/gstore-node/commit/21d258f))
- **Model.update():** fix onUpdateError throwing empty object instead of error ([#153](https://github.com/sebelga/gstore-node/issues/153)) ([b1929c7](https://github.com/sebelga/gstore-node/commit/b1929c7))

<a name="5.0.1"></a>

## [5.0.1](https://github.com/sebelga/gstore-node/compare/v5.0.0...v5.0.1) (2019-02-05)

<a name="5.0.0"></a>

# [5.0.0](https://github.com/sebelga/gstore-node/compare/v4.3.3...v5.0.0) (2019-02-04)

### Bug Fixes

- **Model.update():** Fix bug in Model.update() inside a transaction ([#148](https://github.com/sebelga/gstore-node/issues/148)) ([e4cfaa6](https://github.com/sebelga/gstore-node/commit/e4cfaa6)), closes [#144](https://github.com/sebelga/gstore-node/issues/144)

### Code Refactoring

- Change gstore instantiation to be consistent with es modules ([#149](https://github.com/sebelga/gstore-node/issues/149)) ([3f27d4c](https://github.com/sebelga/gstore-node/commit/3f27d4c))

### Features

- **Populate:** Fetch entities references in Model.get() and queries ([72fff67](https://github.com/sebelga/gstore-node/commit/72fff67))

### BREAKING CHANGES

- The new way to create gstore instances is with "new Gstore(<config>)". Refer to the
  documentation.
- **Populate:** Callback (hell) are not supported anymore as the last argument of gstore methods. Only Promises are returned.
- **Populate:** Node runtime must be version 8 or superior
- **Populate:** The old Schema property types "datetime" and "int" have been removed. Date and Number types should be used instead.

<a name="4.3.3"></a>

## [4.3.3](https://github.com/sebelga/gstore-node/compare/v4.3.2...v4.3.3) (2018-12-29)

### Bug Fixes

- **Sanitize:** Remove non writable property on Joi schema ([#140](https://github.com/sebelga/gstore-node/issues/140)) ([4ba1ce6](https://github.com/sebelga/gstore-node/commit/4ba1ce6)), closes [#139](https://github.com/sebelga/gstore-node/issues/139)

<a name="4.3.2"></a>

## [4.3.2](https://github.com/sebelga/gstore-node/compare/v4.3.1...v4.3.2) (2018-12-21)

### Bug Fixes

- Fixes 'exludeFromRead' for nested paths where object does not exist ([f7c336c](https://github.com/sebelga/gstore-node/commit/f7c336c)), closes [#128](https://github.com/sebelga/gstore-node/issues/128)
- **excludeFromRead:** Make sure segment exist before trying to access it when deserializing ([03bcf53](https://github.com/sebelga/gstore-node/commit/03bcf53))
- **Model:** Update validate() to not sanitize prop where write is set to false ([#138](https://github.com/sebelga/gstore-node/issues/138)) ([e86a875](https://github.com/sebelga/gstore-node/commit/e86a875))

<a name="4.3.1"></a>

## [4.3.1](https://github.com/sebelga/gstore-node/compare/v4.3.0...v4.3.1) (2018-11-13)

### Bug Fixes

- **Model:** Modify validate() method to update entityData on validation ([98dab4b](https://github.com/sebelga/gstore-node/commit/98dab4b))
- **Model:** Preserve gstore KEY on entityData when validating Joi Schema ([f86dbcb](https://github.com/sebelga/gstore-node/commit/f86dbcb))

<a name="4.3.0"></a>

# [4.3.0](https://github.com/sebelga/gstore-node/compare/v4.2.6...v4.3.0) (2018-09-07)

### Bug Fixes

- **entity:** Remove Array wrapping of datastoreEntity() response from cache ([00254d0](https://github.com/sebelga/gstore-node/commit/00254d0))

### Features

- Add global gstore config to return null on entity not found ([6b73631](https://github.com/sebelga/gstore-node/commit/6b73631)), closes [#123](https://github.com/sebelga/gstore-node/issues/123)
- Support "read"-type config for embedded objects ([e3e554f](https://github.com/sebelga/gstore-node/commit/e3e554f)), closes [#122](https://github.com/sebelga/gstore-node/issues/122)

<a name="4.2.6"></a>

## [4.2.6](https://github.com/sebelga/gstore-node/compare/v4.2.5...v4.2.6) (2018-08-26)

### Bug Fixes

- typescript definitions file ([e99125e](https://github.com/sebelga/gstore-node/commit/e99125e))
- typescript definitions file ([399087c](https://github.com/sebelga/gstore-node/commit/399087c))
- **cache:** Throw error when Model.get() returns undefined from cache ([b46758a](https://github.com/sebelga/gstore-node/commit/b46758a)), closes [#119](https://github.com/sebelga/gstore-node/issues/119)

<a name="4.2.5"></a>

## [4.2.5](https://github.com/sebelga/gstore-node/compare/v4.2.4...v4.2.5) (2018-08-18)

### Bug Fixes

- **cache:** Support nsql-cache 1.1.3 ([31d9767](https://github.com/sebelga/gstore-node/commit/31d9767))
- **tests:** Fix integration tests with Redis cache ([0a0838d](https://github.com/sebelga/gstore-node/commit/0a0838d))

<a name="4.2.4"></a>

## [4.2.4](https://github.com/sebelga/gstore-node/compare/v4.2.3...v4.2.4) (2018-07-30)

### Bug Fixes

- **transaction-post-hooks:** Add missing scope to post hooks inside a transaction ([3fe059d](https://github.com/sebelga/gstore-node/commit/3fe059d)), closes [#115](https://github.com/sebelga/gstore-node/issues/115)

<a name="4.2.3"></a>

## [4.2.3](https://github.com/sebelga/gstore-node/compare/v4.2.2...v4.2.3) (2018-07-22)

### Bug Fixes

- **delete-hooks:** Wrong argument mapping in getScopeForDeleteHooks() ([5c91046](https://github.com/sebelga/gstore-node/commit/5c91046))

<a name="4.2.2"></a>

## [4.2.2](https://github.com/sebelga/gstore-node/compare/v4.2.1...v4.2.2) (2018-07-10)

### Bug Fixes

- **dataloader:** Add maxBatchSize option to limit entities to 1000 ([a7c43e9](https://github.com/sebelga/gstore-node/commit/a7c43e9)), closes [#114](https://github.com/sebelga/gstore-node/issues/114)

<a name="4.2.1"></a>

## [4.2.1](https://github.com/sebelga/gstore-node/compare/v4.2.0...v4.2.1) (2018-05-08)

<a name="4.2.0"></a>

# [4.2.0](https://github.com/sebelga/gstore-node/compare/v4.1.1...v4.2.0) (2018-05-08)

### Features

- **global-save:** Add option to validate entity before saving in gstore.save() method ([39ccb9c](https://github.com/sebelga/gstore-node/commit/39ccb9c)), closes [#103](https://github.com/sebelga/gstore-node/issues/103)
- **gstore-save:** Add save method to global save ([9908d7c](https://github.com/sebelga/gstore-node/commit/9908d7c)), closes [#105](https://github.com/sebelga/gstore-node/issues/105)
- **virtual properties:** Access and update virtuals properties directly on the entity instance ([b079f7e](https://github.com/sebelga/gstore-node/commit/b079f7e)), closes [#102](https://github.com/sebelga/gstore-node/issues/102)

<a name="4.1.1"></a>

## [4.1.1](https://github.com/sebelga/gstore-node/compare/v4.1.0...v4.1.1) (2018-04-11)

### Bug Fixes

- **typings:** Add missing generics to Schema in Model creation ([f3cc4b4](https://github.com/sebelga/gstore-node/commit/f3cc4b4))

<a name="4.1.0"></a>

# [4.1.0](https://github.com/sebelga/gstore-node/compare/v4.0.0...v4.1.0) (2018-04-11)

### Bug Fixes

- **queries:** Allow namespace to be set in "list" queries options ([ea5326e](https://github.com/sebelga/gstore-node/commit/ea5326e))
- **queries:** Forward options object to Datastore Query ([2eb0f3f](https://github.com/sebelga/gstore-node/commit/2eb0f3f))

### Features

- **hooks:** Model.delete() "post" hooks callback have now their scope on the entity instance delete ([4d9b4dd](https://github.com/sebelga/gstore-node/commit/4d9b4dd))
- **Schema:** Set new types for Schema definition ([ad51508](https://github.com/sebelga/gstore-node/commit/ad51508))
- **Typescript:** Add Typescript support ([351538b](https://github.com/sebelga/gstore-node/commit/351538b))

<a name="4.0.0"></a>

# [4.0.0](https://github.com/sebelga/gstore-node/compare/v3.0.1...v4.0.0) (2018-03-19)

### Code Refactoring

- **error handling:** Set error code when entity not found in entity.datastoreEntity() method ([03cfd7b](https://github.com/sebelga/gstore-node/commit/03cfd7b))

### Features

- **cache:** Add cache layer to entity.datastoreEntity() method ([63780e4](https://github.com/sebelga/gstore-node/commit/63780e4))

### BREAKING CHANGES

- **error handling:** The error code when the entity is not found has been changed from "404" to the
  "gstore.errors.code.ERR_ENTITY_NOT_FOUND" code
