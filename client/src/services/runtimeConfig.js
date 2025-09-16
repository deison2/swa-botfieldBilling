// src/services/runtimeConfig.js

let authToken = null;

/** called once at app bootstrap */
export function setAuthToken(token) {
  authToken = token;
  console.log('Auth token set again')
}

/** call this anywhere else to grab the current token */
export function getAuthToken() {
  return authToken;
}