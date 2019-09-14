const NOW = 'CURRENT_DATETIME';
const timeNow = (): Date => new Date();
const map: Record<string, (...args: any[]) => void> = {
  CURRENT_DATETIME: timeNow,
};

const handler = (key: string): unknown => {
  if ({}.hasOwnProperty.call(map, key)) {
    return map[key]();
  }

  return null;
};

export default {
  NOW,
  __handler__: handler,
  __map__: map,
};
