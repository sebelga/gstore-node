import moment from 'moment';
import validator from 'validator';
import is from 'is';
import { Datastore } from '@google-cloud/datastore';

import { ValidationError, ValueError, TypeError, ERROR_CODES } from '../errors';
import { EntityData } from '../types';
import Schema, { SchemaPathDefinition, Validator } from '../schema';

const isValidDate = (value: any): boolean => {
  if (
    value.constructor.name !== 'Date' &&
    (typeof value !== 'string' ||
      !/\d{4}-\d{2}-\d{2}([ ,T])?(\d{2}:\d{2}:\d{2})?(\.\d{1,3})?/.exec(value) ||
      !moment(value).isValid())
  ) {
    return false;
  }
  return true;
};

const isInt = (n: unknown): boolean => Number(n) === n && n % 1 === 0;

const isFloat = (n: unknown): boolean => Number(n) === n && n % 1 !== 0;

const isValueEmpty = (v: unknown): boolean =>
  v === null || v === undefined || (typeof v === 'string' && v.trim().length === 0);

const isValidLngLat = (data: any): boolean => {
  const validLatitude = (isInt(data.latitude) || isFloat(data.latitude)) && data.latitude >= -90 && data.latitude <= 90;
  const validLongitude =
    (isInt(data.longitude) || isFloat(data.longitude)) && data.longitude >= -180 && data.longitude <= 180;

  return validLatitude && validLongitude;
};

const errorToObject = ({ code, message }: { code: string; message: string }): { code: string; message: string } => ({
  code,
  message,
});

const validatePropType = (
  value: any,
  propType: unknown,
  prop: unknown,
  pathConfig: SchemaPathDefinition,
  datastore: Datastore,
): TypeError | null => {
  let isValid;
  let ref;
  let type = propType;
  if (typeof propType === 'function') {
    type = propType.name.toLowerCase();
  }

  switch (type) {
    case 'entityKey':
      isValid = datastore.isKey(value);
      ref = 'key.base';
      if (isValid && pathConfig.ref) {
        // Make sure the Entity Kind is also valid (if any)
        const entityKind = value.path[value.path.length - 2];
        isValid = entityKind === pathConfig.ref;
        ref = 'key.entityKind';
      }
      break;
    case 'string':
      isValid = typeof value === 'string';
      ref = 'string.base';
      break;
    case 'date':
      isValid = isValidDate(value);
      ref = 'datetime.base';
      break;
    case 'array':
      isValid = is.array(value);
      ref = 'array.base';
      break;
    case 'number': {
      const isIntInstance = value.constructor.name === 'Int';
      if (isIntInstance) {
        isValid = !isNaN(parseInt(value.value, 10));
      } else {
        isValid = isInt(value);
      }
      ref = 'int.base';
      break;
    }
    case 'double': {
      const isIntInstance = value.constructor.name === 'Double';
      if (isIntInstance) {
        isValid = isFloat(parseFloat(value.value)) || isInt(parseFloat(value.value));
      } else {
        isValid = isFloat(value) || isInt(value);
      }
      ref = 'double.base';
      break;
    }
    case 'buffer':
      isValid = value instanceof Buffer;
      ref = 'buffer.base';
      break;
    case 'geoPoint': {
      if (
        is.object(value) &&
        Object.keys(value).length === 2 &&
        {}.hasOwnProperty.call(value, 'longitude') &&
        {}.hasOwnProperty.call(value, 'latitude')
      ) {
        isValid = isValidLngLat(value);
      } else {
        isValid = value.constructor.name === 'GeoPoint';
      }
      ref = 'geopoint.base';
      break;
    }
    default:
      if (Array.isArray(value)) {
        isValid = false;
      } else {
        isValid = typeof value === type;
      }
      ref = 'prop.type';
  }

  if (!isValid) {
    return new TypeError(ERROR_CODES.ERR_PROP_TYPE, undefined, { ref, messageParams: [prop, type], property: prop });
  }

  return null;
};

const validatePropValue = (prop: string, value: any, validationRule?: Validator): ValueError | null => {
  let validationArgs = [];
  let validationFn: ((...args: any[]) => any) | undefined;

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

    validationFn = (validator as any)[validationRule as string];
  }

  if (!validationFn!.apply(validator, validationArgs)) {
    return new ValueError(ERROR_CODES.ERR_PROP_VALUE, undefined, {
      type: 'prop.validator',
      messageParams: [value, prop],
      property: prop,
    });
  }

  return null;
};

export interface ValidateResponse {
  error: ValidationError | null;
  value: EntityData;
  then: (onSuccess: (entityData: EntityData) => any, onError: (error: ValidationError) => any) => Promise<any>;
  catch: (onError: (error: ValidationError) => any) => Promise<any> | undefined;
}

const validate = (
  entityData: EntityData,
  schema: Schema,
  entityKind: string,
  datastore: Datastore,
): ValidateResponse => {
  const errors = [];

  let prop;
  let skip;
  let schemaHasProperty;
  let pathConfig;
  let propertyType;
  let propertyValue;
  let isEmpty;
  let isRequired;
  let error;

  const props = Object.keys(entityData);
  const totalProps = Object.keys(entityData).length;

  if (schema.isJoi) {
    // We leave the validation to Joi
    return schema.validateJoi(entityData);
  }

  for (let i = 0; i < totalProps; i += 1) {
    prop = props[i];
    skip = false;
    error = null;
    schemaHasProperty = {}.hasOwnProperty.call(schema.paths, prop);
    pathConfig = schema.paths[prop] || {};
    propertyType = schemaHasProperty ? pathConfig.type : null;
    propertyValue = entityData[prop];
    isEmpty = isValueEmpty(propertyValue);

    if (typeof propertyValue === 'string') {
      propertyValue = propertyValue.trim();
    }

    if ({}.hasOwnProperty.call(schema.__virtuals, prop)) {
      // Virtual, remove it and skip the rest
      delete entityData[prop];
      skip = true;
    } else if (!schemaHasProperty && schema.options.explicitOnly === false) {
      // No more validation, key does not exist but it is allowed
      skip = true;
    }

    if (!skip) {
      // ... is allowed?
      if (!schemaHasProperty) {
        error = new ValidationError(ERROR_CODES.ERR_PROP_NOT_ALLOWED, undefined, {
          type: 'prop.not.allowed',
          messageParams: [prop, entityKind],
          property: prop,
        });
        errors.push(errorToObject(error));
      }

      // ...is required?
      isRequired = schemaHasProperty && {}.hasOwnProperty.call(pathConfig, 'required') && pathConfig.required === true;

      if (isRequired && isEmpty) {
        error = new ValueError(ERROR_CODES.ERR_PROP_REQUIRED, undefined, {
          type: 'prop.required',
          messageParams: [prop],
          property: prop,
        });
        errors.push(errorToObject(error));
      }

      // ... is valid prop Type?
      if (schemaHasProperty && !isEmpty && {}.hasOwnProperty.call(pathConfig, 'type')) {
        error = validatePropType(propertyValue, propertyType, prop, pathConfig, datastore);

        if (error) {
          errors.push(errorToObject(error));
        }
      }

      // ... is valid prop Value?
      if (error === null && schemaHasProperty && !isEmpty && {}.hasOwnProperty.call(pathConfig, 'validate')) {
        error = validatePropValue(prop, propertyValue, pathConfig.validate);
        if (error) {
          errors.push(errorToObject(error));
        }
      }

      // ... is value in range?
      if (
        schemaHasProperty &&
        !isEmpty &&
        {}.hasOwnProperty.call(pathConfig, 'values') &&
        !pathConfig.values!.includes(propertyValue)
      ) {
        error = new ValueError(ERROR_CODES.ERR_PROP_IN_RANGE, undefined, {
          type: 'value.range',
          messageParams: [prop, pathConfig.values],
          property: prop,
        });

        errors.push(errorToObject(error));
      }
    }
  }

  let validationError: ValidationError | null = null;

  if (Object.keys(errors).length > 0) {
    validationError = new ValidationError(ERROR_CODES.ERR_VALIDATION, undefined, {
      errors,
      messageParams: [entityKind],
    });
  }

  const validateResponse: ValidateResponse = {
    error: validationError,
    value: entityData,
    then: (onSuccess, onError) => {
      if (validationError) {
        return Promise.resolve(onError(validationError));
      }

      return Promise.resolve(onSuccess(entityData));
    },
    catch: onError => {
      if (validationError) {
        return Promise.resolve(onError(validationError));
      }
      return undefined;
    },
  };

  return validateResponse;
};

export default {
  validate,
};
