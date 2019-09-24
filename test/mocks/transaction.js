'use strict';

function Transaction() {
  const _this = this;
  this.run = () => { };
  this.get = () => { };
  this.save = () => { };
  this.delete = () => { };
  this.commit = () => Promise.resolve();
  this.rollback = () => Promise.resolve();
  this.createQuery = () => ({
    filter: () => { },
    scope: _this,
  });
  this.runQuery = () => Promise.resolve();
}

Transaction.prototype.name = 'Transaction';

module.exports = Transaction;
