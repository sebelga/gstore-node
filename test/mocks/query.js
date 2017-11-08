'use strict';

class Query {
    constructor(ds, mocks, info) {
        this.ds = ds;
        this.mocks = mocks;
        this.info = info;
    }
    run() {
        const info = this.info || {
            moreResults: this.ds.MORE_RESULTS_AFTER_LIMIT,
            endCursor: 'abcdef',
        };
        return Promise.resolve([this.mocks.entities, info]);
    }

    limit() { return this; }

    offset() { return this; }

    order() { return this; }

    filter() { return this; }

    select() { return this; }

    hasAncestor(ancestors) { this.ancestors = ancestors; }
}

module.exports = Query;
