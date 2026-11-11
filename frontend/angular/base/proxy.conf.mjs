// @server-start
// The dev server's proxy (`ng serve`): /api goes to the API, so the page and the API share one origin.
// @server-end
// @noserver-start
// The dev server's proxy (`ng serve`); empty until a server arrives.
// @noserver-end
// @noserver-start
export default {}
// @noserver-end
// @server-start
export default {
  '/api': {
    target: 'http://127.0.0.1:__SERVER_PORT__',
    changeOrigin: false,
  },
}
// @server-end
