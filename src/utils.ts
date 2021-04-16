export const generateRandomString = (length: number) => {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let nonce = ''
  while (nonce.length < length) {
      nonce += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return nonce
}

export const encodeParams = (parameters: any) => {
  const jsonstring = JSON.stringify(parameters)
  return Buffer.from(jsonstring).toString('base64')
}
