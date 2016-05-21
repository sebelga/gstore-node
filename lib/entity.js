(function() {
    'use strict';

    /*!
    * Module dependencies.
    */
    var EventEmitter = require('events').EventEmitter;
    var hooks        = require('hooks-fixed');
    //var utils        = require('./utils');


    class Entity extends EventEmitter{
        constructor(data, id) {
            this.isNew   = true;
            this.emitter = new EventEmitter();
            this.emitter.setMaxListeners(0);
            this.$registerHooksFromSchema();

            this.schema = {}; // Temp

            if (data) {
                if (data instanceof Entity) {
                    this.isNew = data.isNew;
                } else {
                    this.init(data, id);
                }
            }

            for (var k in hooks) {
                if (hooks.hasOwnProperty(k)) {
                    this[k] = hooks[k];
                }
            }
        }

        init (data, id) {
            this.isNew      = false;
            this.entityData = buildEntityData(data);

            if (this.schema.hasOwnProperty.modifiedOn) {
                this.entityData.modifiedOn = new Date();
            }

            if (id) {
                id  = isNaN(parseInt(id, 10)) ? id : parseInt(id, 10);
                this.entityKey = this.ds.key([this.entityName, id]);
            } else {
                this.entityKey = this.ds.key(this.entityName);
            }

            return this;
        };
    }

    function buildEntityData(data) {
        if (data) {
            var entityData = {};
            Object.keys(data).forEach(function (k) {
                entityData[k] = data[k];
            });

            return entityData;
        }
    }

    module.exports = exports = Entity;
})();
