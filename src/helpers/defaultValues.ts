'use strict';

const NOW = 'CURRENT_DATETIME';
const timeNow = () => new Date();
const map: Record<string, (...args: any[]) => void> = {
  CURRENT_DATETIME: timeNow,
};

const handler = (key: string) => {
  if (({}).hasOwnProperty.call(map, key)) {
    return map[key]();
  }

  return null;
};

export default {
  NOW,
  __handler__: handler,
  __map__: map,
};
