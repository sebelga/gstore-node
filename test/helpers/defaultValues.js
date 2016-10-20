
const chai   = require('chai');
const expect = chai.expect;
const sinon  = require('sinon');
const defaultValues = require('../../lib/helpers/defaultValues');

describe('Query Helpers', () => {
    "use strict";

    describe('defaultValues constants handler()', () => {
        it('should return the current time', () => {
            let value = defaultValues.NOW;
            let result = defaultValues.__handler__(value);

            /**
             * we might have a slightly difference, that's ok :)
             */
            let dif = Math.abs(result.getTime() - new Date().getTime());

            expect(dif).to.be.below(10);
        });

        it('should return null if value passed not in map', () => {
            let value = 'DOES_NOT_EXIST';
            let result = defaultValues.__handler__(value);

            expect(result).equal(null);
        });
    });
});
