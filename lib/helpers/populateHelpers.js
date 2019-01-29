'use strict';

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
const addPathToPopulateRefs = (initialPath, select = ['*'], refs) => {
    const pathToArray = initialPath.split('.');
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

module.exports = { addPathToPopulateRefs };