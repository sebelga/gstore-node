'use strict';

const chai = require('chai');

const Gstore = require('../../lib/index');
const cache = require('../../lib/cache/index');

const { expect, assert } = chai;

describe('cache', () => {
    beforeEach(() => {
        Gstore.clear();
    });

    it('should not set any cache', () => {
        const gstore = Gstore({ cache: false });
        const gstore2 = Gstore({ namespace: 'other' });

        assert.isUndefined(gstore.cache);
        assert.isUndefined(gstore2.cache);
    });

    it('should set the cache to default memory lru-cache', () => {
        const gstore = Gstore({ cache: true });
        expect(gstore.cache.store.name).equal('memory');
    });
});
