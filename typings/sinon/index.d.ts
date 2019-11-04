declare module 'sinon' {
  interface API {
    stub: any;
    spy: any;
  }
  const api: API;
  export default api;
}
