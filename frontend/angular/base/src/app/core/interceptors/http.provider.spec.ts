import { HTTP_INTERCEPTORS_IN_ORDER } from './http.provider'
import { authInterceptor } from './auth.interceptor' // @server:auth
import { errorInterceptor } from './error.interceptor' // @server
import { loadingInterceptor } from './loading.interceptor'

describe('HTTP_INTERCEPTORS_IN_ORDER', () => {
  it('puts loading outermost and the error mapper inside it', () => {
    expect(HTTP_INTERCEPTORS_IN_ORDER).toEqual([
      loadingInterceptor,
      errorInterceptor, // @server
      authInterceptor, // @server:auth
    ])
  })
})
