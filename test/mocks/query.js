'use strict';

class Query {
  constructor(ds, mocks, info, namespace) {
    this.ds = ds;
    this.mocks = mocks;
    this.info = info;
    this.kinds = ['MockQuery'];
    this.filters = [];
    this.namespace = namespace || 'mock.query';
    this.groupByVal = [];
    this.orders = [];
    this.selectVal = [];
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
