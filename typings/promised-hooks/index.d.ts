declare module 'promised-hooks' {
  interface Hooks {
    wrap: (obj: any) => any;
    ERRORS: symbol;
  }

  function wrap(obj: any): any

  const hooks: Hooks;

  export default hooks
}
