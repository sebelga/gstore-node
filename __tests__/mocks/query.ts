class Query {
  public ds: any;

  public mocks: any;

  public info: any;

  public kinds: any;

  public filters: any;

  public namespace: string;

  public groupByVal: any;

  public orders: any;

  public selectVal: any;

  public ancestors: any;

  constructor(ds: any, mocks?: any, info?: any, namespace?: string) {
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

  run(): Promise<any> {
    const info = this.info || {
      moreResults: this.ds.MORE_RESULTS_AFTER_LIMIT,
      endCursor: 'abcdef',
    };
    return Promise.resolve([this.mocks.entities, info]);
  }

  limit(): Query {
    return this;
  }

  offset(): Query {
    return this;
  }

  order(): Query {
    return this;
  }

  filter(): Query {
    return this;
  }

  select(): Query {
    return this;
  }

  hasAncestor(ancestors: any): void {
    this.ancestors = ancestors;
  }
}

export default Query;
