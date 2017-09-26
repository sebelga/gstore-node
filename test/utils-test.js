'use strict';

const chai = require('chai');
const utils = require('../lib/utils');

const { expect } = chai;

describe('Utils', () => {
    describe('promisify()', () => {
        it('should not promisify methods already promisified', () => {
            class Test {
                save() {
                    return Promise.resolve(this);
                }
            }

            Test.prototype.save.__promisified = true;
            const ref = Test.prototype.save;
            Test.save = utils.promisify(Test.prototype.save);

            expect(Test.save).equal(ref);
        });
    });
});
