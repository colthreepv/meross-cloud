export interface CloudOptions {
  email: string
  password: string
  logger?: (text: string) => void
}

export interface DeviceDefinition {
  uuid: string
  onlineStatus: number
  devName: string
  devIconId: string
  bindTime: number
  deviceType: string
  subType: string
  channels: any[]
  region: string
  fmwareVersion: string
  hdwareVersion: string
  userDevIcon: string
  iconType: number
  skillNumber: string
  domain: string
  reservedDomain: string
}

export interface MerossHeaders {
    messageId: string;
    namespace: string;
    method: string;
    payloadVersion: number;
    from: string;
    timestamp: number;
    timestampMs: number;
    sign: string;
}

export interface MerossMessage<T> {
    header: MerossHeaders
    payload: T
}

export interface GenericMerossResponse<T> {
    info: string // could be 'Success' or something else
    apiStatus: string
    data: T
}

export type DevListResponse = DeviceDefinition[]
export type LoginResponse = {
    token: string
    key: string
    userid: string
    email: string
}
