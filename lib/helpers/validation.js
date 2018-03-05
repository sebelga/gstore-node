'use strict';

const moment = require('moment');
const validator = require('validator');
const is = require('is');

const gstoreErrors = require('../errors');

const isValidDate = (value) => {
    if (value.constructor.name !== 'Date' &&
        (typeof value !== 'string' ||
            !value.match(/\d{4}-\d{2}-\d{2}([ ,T])?(\d{2}:\d{2}:\d{2})?(\.\d{1,3})?/) ||
            !moment(value).isValid())) {
        return false;
    }
    return true;
};

const isInt = n => Number(n) === n && n % 1 === 0;

const isFloat = n => Number(n) === n && n % 1 !== 0;

const isValueEmpty = v => (
    v === null || v === undefined || (typeof v === 'string' && v.trim().length === 0)
);

const isValidLngLat = (data) => {
    const validLatitude = (isInt(data.latitude) || isFloat(data.latitude))
        && data.latitude >= -90 && data.latitude <= 90;
    const validLongitude = (isInt(data.longitude) || isFloat(data.longitude))
        && data.longitude >= -180 && data.longitude <= 180;

    return validLatitude && validLongitude;
};

const errorToObject = error => (
    {
        code: error.code,
        type: error.type,
        message: error.message,
    }
);

const validatePropType = (value, propType, prop) => {
    let valid;
    let ref;

    switch (propType) {
        case 'string':
            /* eslint valid-typeof: "off" */
            valid = typeof value === 'string';
            ref = 'string.base';
            break;
        case 'datetime':
            valid = isValidDate(value);
            ref = 'datetime.base';
            break;
        case 'array':
            valid = is.array(value);
            ref = 'array.base';
            break;
        case 'int': {
            const isIntInstance = value.constructor.name === 'Int';
            if (isIntInstance) {
                valid = !isNaN(parseInt(value.value, 10));
            } else {
                valid = isInt(value);
            }
            ref = 'int.base';
            break;
        }
        case 'double': {
            const isIntInstance = value.constructor.name === 'Double';
            if (isIntInstance) {
                valid = isFloat(parseFloat(value.value, 10)) ||
                    isInt(parseFloat(value.value, 10));
            } else {
                valid = isFloat(value) || isInt(value);
            }
            ref = 'double.base';
            break;
        }
        case 'buffer':
            valid = value instanceof Buffer;
            ref = 'buffer.base';
            break;
        case 'geoPoint': {
            if (is.object(value) && Object.keys(value).length === 2
                && {}.hasOwnProperty.call(value, 'longitude')
                && {}.hasOwnProperty.call(value, 'latitude')) {
                valid = isValidLngLat(value);
            } else {
                valid = value.constructor.name === 'GeoPoint';
            }
            ref = 'geopoint.base';
            break;
        }
        default:
            /* eslint valid-typeof: "off" */
            valid = typeof value === propType;
            ref = 'prop.type';
    }

    if (!valid) {
        return new gstoreErrors.TypeError(
            gstoreErrors.errorCodes.ERR_PROP_TYPE,
            null,
            { ref, messageParams: [prop, propType], property: prop }
        );
    }

    return null;
};

const validatePropValue = (value, validationRule, propType, prop) => {
    let validationArgs = [];
    let validationFn;

    /**
     * If the validate property is an object, then it's assumed that
     * it contains the 'rule' property, which will be the new
     * validationRule's value.
     * If the 'args' prop was passed then we concat them to 'validationArgs'.
     */

    if (typeof validationRule === 'object') {
        const { rule } = validationRule;
        validationArgs = validationRule.args || [];

        if (typeof rule === 'function') {
            validationFn = rule;
            validationArgs = [value, validator, ...validationArgs];
        } else {
            validationRule = rule;
        }
    }

    if (!validationFn) {
        /**
         * Validator.js only works with string values
         * let's make sure we are working with a string.
         */
        const isObject = typeof value === 'object';
        const strValue = typeof value !== 'string' && !isObject ? String(value) : value;
        validationArgs = [strValue, ...validationArgs];

        validationFn = validator[validationRule];
    }

    if (!validationFn.apply(validator, validationArgs)) {
        return new gstoreErrors.ValueError(
            gstoreErrors.errorCodes.ERR_PROP_VALUE,
            null,
            { type: 'prop.validator', messageParams: [value, prop], property: prop }
        );
    }

    return null;
};

const validate = (entityData, schema, entityKind) => {
    const errors = [];

    let prop;
    let skip;
    let schemaHasProperty;
    let propertyType;
    let propertyValue;
    let isEmpty;
    let isRequired;
    let error;

    const props = Object.keys(entityData);
    const totalProps = Object.keys(entityData).length;
    const isJoi = !is.undef(schema._joi);

    if (isJoi) {
        // We leave the validation to Joi
        const joiOptions = schema.options.joi.options || {};
        joiOptions.stripUnknown = {}.hasOwnProperty.call(joiOptions, 'stripUnknown') ?
            joiOptions.stripUnknown : schema.options.explicitOnly !== false;
        return schema._joi.validate(entityData, joiOptions);
    }

    for (let i = 0; i < totalProps; i += 1) {
        prop = props[i];
        skip = false;
        error = null;
        schemaHasProperty = {}.hasOwnProperty.call(schema.paths, prop);
        propertyType = schemaHasProperty ? schema.paths[prop].type : null;
        propertyValue = entityData[prop];
        isEmpty = isValueEmpty(propertyValue);

        if (typeof propertyValue === 'string') {
            propertyValue = propertyValue.trim();
        }

        if ({}.hasOwnProperty.call(schema.virtuals, prop)) {
            // Virtual, remove it and skip the rest
            delete entityData[prop];
            skip = true;
        } else if (!schemaHasProperty && schema.options.explicitOnly === false) {
            // No more validation, key does not exist but it is allowed
            skip = true;
        }

        if (!skip) {
            // ... is allowed
            if (!schemaHasProperty) {
                error = new gstoreErrors.ValidationError(
                    gstoreErrors.errorCodes.ERR_PROP_NOT_ALLOWED,
                    null,
                    {
                        type: 'prop.not.allowed',
                        messageParams: [prop, entityKind],
                        property: prop,
                    }
                );
                errors.push(errorToObject(error));
                // return;
            }

            // ...is required
            isRequired = schemaHasProperty &&
                {}.hasOwnProperty.call(schema.paths[prop], 'required') &&
                schema.paths[prop].required === true;

            if (isRequired && isEmpty) {
                error = new gstoreErrors.ValueError(
                    gstoreErrors.errorCodes.ERR_PROP_REQUIRED,
                    null,
                    {
                        type: 'prop.required',
                        messageParams: [prop],
                        property: prop,
                    }
                );
                errors.push(errorToObject(error));
            }

            // ... valid prop Type
            if (schemaHasProperty && !isEmpty && {}.hasOwnProperty.call(schema.paths[prop], 'type')) {
                error = validatePropType(propertyValue, propertyType, prop);

                if (error) {
                    errors.push(errorToObject(error));
                }
            }

            // ... valid prop Value
            if (error === null &&
                schemaHasProperty &&
                !isEmpty &&
                {}.hasOwnProperty.call(schema.paths[prop], 'validate')) {
                error = validatePropValue(propertyValue, schema.paths[prop].validate, propertyType, prop);
                if (error) {
                    errors.push(errorToObject(error));
                }
            }

            // ... value in range
            if (schemaHasProperty && !isEmpty &&
                {}.hasOwnProperty.call(schema.paths[prop], 'values') &&
                schema.paths[prop].values.indexOf(propertyValue) < 0) {
                error = new gstoreErrors.ValueError(
                    gstoreErrors.errorCodes.ERR_PROP_IN_RANGE,
                    null,
                    { type: 'value.range', messageParams: [prop, schema.paths[prop].values], property: prop }
                );

                errors.push(errorToObject(error));
            }
        }
    }

    let validationError = null;

    if (Object.keys(errors).length > 0) {
        validationError = new gstoreErrors.ValidationError(
            gstoreErrors.errorCodes.ERR_VALIDATION,
            null,
            { errors, messageParams: [entityKind] }
        );
    }

    return {
        error: validationError,
        value: entityData,
        then: (onSuccess, onError) => {
            if (validationError) {
                return Promise.resolve(onError(validationError));
            }

            return Promise.resolve(onSuccess(entityData));
        },
        catch: (onError) => {
            if (validationError) {
                return Promise.resolve(onError(validationError));
            }
            return undefined;
        },
    };
};

module.exports = {
    validate,
};
