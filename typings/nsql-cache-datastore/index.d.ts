declare module 'nsql-cache-datastore' {
  function factory(ds?: any): {
    keyToString: (key: any) =>  string
  }
  export default factory;
}
