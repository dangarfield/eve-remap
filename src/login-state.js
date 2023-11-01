import { loadData, saveData, clearData } from './utils'
// import { createSSO } from 'eve-sso-pkce'
import { createSSO } from './sso/eve-sso-pkce.es.js'

const ssoConfig = window.location.href.includes('localhost')
  ? {
      clientId: 'd3639f9146214ab3b97010e558042c76',
      redirectUri: 'http://localhost:3000/'
    }
  : {
      clientId: '79dfdc54840a4f4f81402ab26ede38cf',
      redirectUri: 'https://dangarfield.github.io/eve-remap/'
    }
// console.log('ssoConfig', ssoConfig)
const sso = createSSO(ssoConfig)
const scopes = 'esi-skills.read_skills.v1 esi-skills.read_skillqueue.v1 esi-clones.read_implants.v1'.split(' ')

export const initLoginState = async () => {
  document.querySelector('.login').addEventListener('click', async (event) => {
    event.preventDefault()
    clearData('codeVerifier')
    clearData('token')
    console.log('scopes', scopes)
    const ssoUri = await sso.getUri(scopes)
    console.log('ssoUri', ssoUri)
    saveData('codeVerifier', ssoUri.codeVerifier)
    console.log('ssoUri', scopes, ssoUri)
    window.location.assign(ssoUri.uri)
  })

  const data = loadData()
  console.log('data', data)
  if (data.token) {
    // console.log('Successfully logged in')
    return true
  } else if (data.codeVerifier) {
    console.log('Code verifier set, awaiting server response')
    const urlParams = new URLSearchParams(window.location.search)
    const code = urlParams.get('code')
    const state = urlParams.get('state')
    if (code && state) {
      console.log('code', code, 'state', state)

      const token = await sso.getAccessToken(code, data.codeVerifier)
      console.log('token', token)
      saveData('token', token)
      clearData('codeVerifier')

      window.location.assign(window.location.href.split('?')[0]) // Strip the url parameters
    } else {
      // If this happens, we need to clear the
      clearData('codeVerifier')
      window.location.assign(window.location.href.split('?')[0])
    }
    console.log('No code or state in the url, SSO return unsuccessful')
  } else {
    console.log('No login state set')
  }

  return false
}
export const refreshToken = async () => {
  const data = loadData()
  console.log('TODO refreshToken', data.token.refresh_token)
  const newToken = await sso.refreshToken(data.token.refresh_token)
  console.log('newToken', newToken)
  saveData('token', newToken)
  // alert('refresh')
  window.location.assign(window.location.href.split('?')[0])
}
