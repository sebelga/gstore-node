'use strict';

const NOW = 'CURRENT_DATETIME';
const timeNow = () => new Date();
const map = {
    CURRENT_DATETIME: timeNow,
};

const handler = value => {
    if (({}).hasOwnProperty.call(map, value)) {
        return map[value]();
    }

    return null;
};

module.exports = {
    NOW,
    __handler__: handler,
    __map__: map,
};
