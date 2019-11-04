declare module '@hapi/joi' {
  interface API {
    string: any;
    number: any;
    array: any;
  }
  const api: API;
  export default api;
}
