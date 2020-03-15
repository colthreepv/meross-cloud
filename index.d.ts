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

    publishMessage(method: 'GET' | 'SET', namespace: string, payload: any): Promise<MerossMessage<any>>

    getSystemAllData(): Promise<MerossMessage<any>>
    getSystemDebug(): Promise<MerossMessage<any>>
    getSystemAbilities(): Promise<MerossMessage<any>>
    getSystemReport(): Promise<MerossMessage<any>>
    getSystemRuntime(): Promise<MerossMessage<any>>
    getSystemDNDMode(): Promise<MerossMessage<any>>
    getOnlineStatus(): Promise<MerossMessage<any>>
    getConfigWifiList(): Promise<MerossMessage<any>>
    getConfigTrace(): Promise<MerossMessage<any>>
    getControlPowerConsumption(): Promise<MerossMessage<any>>
    getControlPowerConsumptionX(): Promise<MerossMessage<GetControlPowerConsumptionXResponse>>
    getControlElectricity(): Promise<MerossMessage<GetControlElectricityResponse>>

    controlToggle(onoff: boolean): Promise<MerossMessage<any>>
    controlToggleX(channel: any, onoff: boolean): Promise<MerossMessage<any>>
    controlSpray(channel: any, mode: number): Promise<MerossMessage<any>>
    controlGarageDoor(channel: any, open: boolean): Promise<MerossMessage<any>>
    controlLight(light: any): Promise<MerossMessage<any>>
    setSystemDNDMode(onoff: boolean): Promise<MerossMessage<any>>
  }

  export default MerossCloud
}
