declare module 'nsql-cache-datastore' {
  function factory(): {
    keyToString: (key: any) =>  string
  }
  export default factory;
}
