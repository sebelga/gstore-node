function Transaction(this: any): void {
  this.run = (): any => {};
  this.get = (): any => {};
  this.save = (): any => {};
  this.delete = (): any => {};
  this.commit = (): any => Promise.resolve();
  this.rollback = (): any => Promise.resolve();
  this.createQuery = (): any => ({
    filter: (): any => {},
    scope: this,
  });
  this.runQuery = (): any => Promise.resolve();
}

Transaction.prototype.name = 'Transaction';

export default Transaction as any;
