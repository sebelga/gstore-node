import Schema from '../schema';
import { GenericObject } from '../types';

/**
 * To improve performance and avoid looping over and over the entityData or Schema config
 * we generate a meta object to cache useful data used later in models and entities methods.
 */
const extractMetaFromSchema = <T extends object>(paths: Schema<T>['paths']): GenericObject => {
  const meta: GenericObject = {};

  Object.keys(paths).forEach(k => {
    const propType = paths[k as keyof T].type as any;
    const stringType = propType !== undefined && propType.name ? propType.name : propType;

    switch (stringType) {
      case 'geoPoint':
        // This allows us to automatically convert valid lng/lat objects
        // to Datastore.geoPoints
        meta.geoPointsProps = meta.geoPointsProps || [];
        meta.geoPointsProps.push(k);
        break;
      case 'entityKey':
        meta.refProps = meta.refProps || {};
        meta.refProps[k] = true;
        break;
      case 'Date':
        meta.dateProps = meta.dateProps || [];
        meta.dateProps.push(k);
        break;
      default:
    }
  });

  return meta;
};

export default { extractMetaFromSchema };
