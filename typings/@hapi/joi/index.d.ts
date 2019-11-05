declare module '@hapi/joi' {
  interface API {
    string: any;
    number: any;
    array: any;
    date: any;
    object: any;
    any: any;
    valid: any;
  }
  const api: API;
  export default api;
}
