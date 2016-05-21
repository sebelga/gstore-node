(function() {
    'use strict';

    var EventEmitter = require('events').EventEmitter;
    var utils        = require('./utils');
    var Kareem       = require('kareem');

    const IS_QUERY_HOOK = {
        update : true
    };

    class Schema {

        constructor(obj, options) {
            var self              = this;

            // const defaultMiddleware = [
            //     /* Validate Schema Middleware */
            //     {
            //         kind:'pre',
            //         hook:'save',
            //         fn: (next, options) => {
            //             console.log('ctx:', this);
            //             var hasValidateBeforeSaveOption = options &&
            //                 (typeof options === 'object') &&
            //                 ('validateBeforeSave' in options);
            //
            //             var shouldValidate;
            //             if (hasValidateBeforeSaveOption) {
            //                 shouldValidate = !!options.validateBeforeSave;
            //             } else {
            //                 shouldValidate = this.schema.options.validateBeforeSave;
            //             }
            //
            //             // Validate
            //             if (shouldValidate) {
            //                 console.log('Should Validate Schema before saving!!!');
            //                 next();
            //                 // this.validate({__noPromise: true}, function(error) {
            //                 //     next(error);
            //                 // });
            //             } else {
            //                 console.log('Not validating Schema before saving...');
            //                 next();
            //             }
            //
            //         }
            //     }
            // ];

            this.instanceOfSchema = true;
            this.methods          = {};
            this.defaultQueries   = {};
            this.paths            = {};
            this.callQueue        = [];
            this.options          = defaultOptions(options);

            this.s = {
                hooks: new Kareem(),
                queryHooks: IS_QUERY_HOOK
            };

            // defaultMiddleware.forEach(function(m) {
            //     self[m.kind](m.hook, !!m.isAsync, m.fn);
            // });

            Object.keys(obj).forEach((k) => {
                self.paths[k] = obj[k];
            });
        }

        // pre (hook, isAsync, fn) {
        //     //var name = arguments[0];
        //     if (IS_QUERY_HOOK[hook]) {
        //         this.s.hooks.pre.apply(this.s.hooks, arguments);
        //         return this;
        //     }
        //     return this.queue('pre', [hook, isAsync, fn]);
        // }
        //
        // post (hook, isAsync, fn) {
        //
        // }
        //
        // queue (hook, args) {
        //     this.callQueue.push([hook, args]);
        //     return this.callQueue;
        // }
    }

    /**
     * Merge options passed with the default option for Schemas
     * @param options
     */
    function defaultOptions(options) {
        let optionsDefault = {
            validateBeforeSave:true,
            typeKey : 'type'
        };
        return utils.options(defaultOptions, options);
    }

    module.exports = exports = Schema;
})();
