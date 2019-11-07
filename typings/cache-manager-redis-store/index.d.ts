declare module 'cache-manager-redis-store' {
  function factory(ds?: any): {
    keyToString: (key: any) =>  string
  }
  export default factory;
}
