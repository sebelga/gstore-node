declare module 'chai' {
  interface API {
    expect: any;
    assert: any;
  }
  const api: API;
  export default api;
}
