'use strict';

const chai = require('chai');
const defaultValues = require('../../lib/helpers/defaultValues');

const expect = chai.expect;

describe('Query Helpers', () => {
    describe('defaultValues constants handler()', () => {
        it('should return the current time', () => {
            const value = defaultValues.NOW;
            const result = defaultValues.__handler__(value);

            /**
             * we might have a slightly difference, that's ok :)
             */
            const dif = Math.abs(result.getTime() - new Date().getTime());

            expect(dif).to.be.below(10);
        });

        it('should return null if value passed not in map', () => {
            const value = 'DOES_NOT_EXIST';
            const result = defaultValues.__handler__(value);

            expect(result).equal(null);
        });
    });
});
