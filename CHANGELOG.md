# Change Log

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

<a name="4.0.0"></a>
# [4.0.0](https://github.com/sebelga/gstore-node/compare/v3.0.1...v4.0.0) (2018-03-19)


### Code Refactoring

* **error handling:** Set error code when entity not found in entity.datastoreEntity() method ([03cfd7b](https://github.com/sebelga/gstore-node/commit/03cfd7b))


### Features

* **cache:** Add cache layer to entity.datastoreEntity() method ([63780e4](https://github.com/sebelga/gstore-node/commit/63780e4))


### BREAKING CHANGES

* **error handling:** The error code when the entity is not found has been changed from "404" to the
"gstore.errors.code.ERR_ENTITY_NOT_FOUND" code
