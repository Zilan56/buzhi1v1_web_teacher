/**
 * HTTP 请求门面。业务代码统一使用 `api.get/post/postForm/put/patch/delete/getBlob`。
 * 实现细节（超时、401、HTML 防御、日志）见 `lib/http.ts`。
 */

import { httpRequest } from './http'

export type { ApiError, ApiErrorKind } from './http'

export const api = {
  get:       <T>(path: string, options?: { skipAuth?: boolean }) => httpRequest<T>('GET', path, options),
  post:      <T>(path: string, body?: unknown, options?: { skipAuth?: boolean }) => httpRequest<T>('POST', path, { body, ...options }),
  postForm:  <T>(path: string, form: FormData) => httpRequest<T>('POST', path, { form }),
  put:       <T>(path: string, body?: unknown) => httpRequest<T>('PUT', path, { body }),
  patch:     <T>(path: string, body?: unknown) => httpRequest<T>('PATCH', path, { body }),
  delete:    <T>(path: string) => httpRequest<T>('DELETE', path),
  getBlob:   (path: string) => httpRequest<Blob>('GET', path, { responseType: 'blob' }),
}
