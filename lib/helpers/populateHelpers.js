'use strict';

const arrify = require('arrify');

/**
 *
 * @param {*} initialPath Path to add to the refs array
 * @param {*} select Array of properties to select from the populated ref
 * @param {*} refs Array of refs, each index is one level deep in the entityData tree
 *
 * @example
 *
 * const entityData = {
 *  user: Key, // ---> once fetched it will be { name: String, company: Key }
 *  address: Key
 * }
 *
 * To fetch the "address", the "user" and the user's "conmpany", the array of refs
 * to retrieve will be
 *
 * [
 *  [{ path: 'user', select: ['*'] }, [ path: 'address', select: ['*'] ], // tree depth = 0
 *  [{ path: 'user.company', select: ['*'] }], // tree depth = 1
 * ]
 */
const addPathToPopulateRefs = (initialPath, _select = ['*'], refs) => {
    const pathToArray = initialPath.split('.');
    const select = arrify(_select);
    let prefix = '';

    pathToArray.forEach((prop, i) => {
        const currentPath = prefix ? `${prefix}.${prop}` : prop;
        const nextPath = pathToArray[i + 1];
        const hasNextPath = typeof nextPath !== 'undefined';
        const refsAtCurrentTreeLevel = refs[i] || [];

        // Check if we alreday have a config for this tree level
        const pathConfig = refsAtCurrentTreeLevel.find(ref => ref.path === currentPath);

        if (!pathConfig) {
            refsAtCurrentTreeLevel.push({ path: currentPath, select: hasNextPath ? [nextPath] : select });
        } else if (hasNextPath && !pathConfig.select.some(s => s === nextPath)) {
            // Add the next path to the selected properties on the ref
            pathConfig.select.push(nextPath);
        } else if (!hasNextPath && select.length) {
            pathConfig.select.push(...select);
        }
        refs[i] = refsAtCurrentTreeLevel;

        prefix = currentPath;
    });
};

const populateFactory = (refsToPopulate, promise, Model) => (path, propsToSelect) => {
    if (propsToSelect && Array.isArray(path)) {
        throw new Error('Only 1 property can be populated when fields to select are provided');
    }

    // If no path is specified, we fetch all the schema properties that are references to entities (Keys)
    const paths = path
        ? arrify(path)
        : Model.getEntitiesRefsFromSchema();

    paths.forEach(p => addPathToPopulateRefs(p, propsToSelect, refsToPopulate));

    return promise;
};

module.exports = { addPathToPopulateRefs, populateFactory };
