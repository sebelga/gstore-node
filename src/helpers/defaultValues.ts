const NOW = 'CURRENT_DATETIME';

const returnCurrentTime = (): Date => new Date();

const mapDefaultValueIdToHandler: Record<string, (...args: any[]) => void> = {
  [NOW]: returnCurrentTime,
};

const handler = (key: string): unknown => {
  if ({}.hasOwnProperty.call(mapDefaultValueIdToHandler, key)) {
    return mapDefaultValueIdToHandler[key]();
  }

  return null;
};

export interface DefaultValues {
  NOW: 'CURRENT_DATETIME';
  __handler__: (key: string) => unknown;
  __map__: { [key: string]: () => any };
}

const defaultValues: DefaultValues = {
  NOW,
  __handler__: handler,
  __map__: mapDefaultValueIdToHandler,
};

export default defaultValues;
