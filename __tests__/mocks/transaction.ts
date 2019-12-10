function Transaction(this: any): void {
  this.run = (): any => undefined;
  this.get = (): any => undefined;
  this.save = (): any => undefined;
  this.delete = (): any => undefined;
  this.commit = (): any => Promise.resolve();
  this.rollback = (): any => Promise.resolve();
  this.createQuery = (): any => ({
    filter: (): any => undefined,
    scope: this,
  });
  this.runQuery = (): any => Promise.resolve();
}

Transaction.prototype.name = 'Transaction';

export default Transaction as any;
