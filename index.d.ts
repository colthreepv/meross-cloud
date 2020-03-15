declare module 'meross-cloud' {
import { EventEmitter } from 'events'
import { MqttClient } from 'mqtt'

    export { TimeoutError } from 'promise-timeout'

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
  export interface GetControlPowerConsumptionXResponse {
    date: string
    /**
    * timestamp, utc.
    * has to be multiplied by 1000 to use on new Date(time)
    */
    time: number
    value: number
  }
  export interface GetControlElectricityResponse {
    channel: number
    /**
    * current in decimilliAmp. Has to get divided by 10000 to get Amp(s)
    */
    current: number
    /**
    * voltage in deciVolt. Has to get divided by 10 to get Volt(s)
    */
    voltage: number
    /**
    * power in milliWatt. Has to get divided by 1000 to get Watt(s)
    */
    power: number
    config: {
      voltageRatio: number
      electricityRatio: number
    }
  }

  export interface CloudOptions {
    email: string
    password: string
    logger?: Function
  }

  export type Callback<T> = (error: Error | null, data: T) => void
  export type ErrorCallback = (error: Error | null) => void
  export type DeviceInitializedEvent = 'deviceInitialized'
  export type DeviceInitializedCallback = (deviceId: string, deviceDef: DeviceDefinition, device: MerossCloudDevice) => void

  export type DeviceEvents = 'connected' | 'data' | 'rawData' | 'close' | 'reconnect' | 'error'

  export class MerossCloud extends EventEmitter {
    constructor (options: CloudOptions)
    connect (callback: Callback<number>): void
    connect (): Promise<MerossCloudDevice[]>

    on(name: DeviceInitializedEvent, handler: DeviceInitializedCallback): this

    connectDevice(deviceId: string, deviceObj: MerossCloudDevice, dev: DeviceDefinition): MerossCloudDevice

    authenticatedPost(url: string, paramsData: Object, callback: Callback<any>): void
    authenticatedPost(url: string, paramsData: Object): Promise<any>
  }

  export class MerossCloudDevice extends EventEmitter {
    clientResponseTopic: string
    waitingMessageIds: Record<string, any>
    token: string
    key: string
    userId: string
    dev: DeviceDefinition
    client: MqttClient
    status: 'init' | 'online' | 'offline'
    queuedCommands: []

    connect(): void
    disconnect(force: boolean): void

    on(event: DeviceEvents, listener: (...args: any[]) => void): this;

    publishMessage(method: 'GET' | 'SET', namespace: string, payload: any, callback?: Callback<any>): number
    publishMessage(method: 'GET' | 'SET', namespace: string, payload: any): Promise<any>

    getSystemAllData(): Promise<void>
    getSystemDebug(): Promise<void>
    getSystemAbilities(): Promise<void>
    getSystemReport(): Promise<void>
    getSystemRuntime(): Promise<void>
    getSystemDNDMode(): Promise<void>
    getOnlineStatus(): Promise<void>
    getConfigWifiList(): Promise<void>
    getConfigTrace(): Promise<void>
    getControlPowerConsumption(): Promise<void>
    getControlPowerConsumptionX(): Promise<MerossMessage<GetControlPowerConsumptionXResponse>>
    getControlElectricity(): Promise<MerossMessage<GetControlElectricityResponse>>

    controlToggle(onoff: boolean, callback: Callback<any>): number
    controlToggleX(channel: any, onoff: boolean, callback: Callback<any>): number
    controlSpray(channel: any, mode: number, callback: Callback<any>): number
    controlGarageDoor(channel: any, open: boolean, callback: Callback<any>): number
    controlLight(light: any, callback: Callback<any>): number
    setSystemDNDMode(onoff: boolean, callback: Callback<any>): number
  }

  export default MerossCloud
}
