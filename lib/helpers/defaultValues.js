'use strict';

const NOW = 'CURRENT_DATETIME';

const handler = (value) => {
    if (({}).hasOwnProperty.call(map, value)) {
        return map[value]();
    }

    return null;
};

const timeNow = () => {
    return new Date();
};

const map = {
    'CURRENT_DATETIME' : timeNow
};

module.exports = {
    NOW,
    __handler__: handler,
    __map__: map
};
