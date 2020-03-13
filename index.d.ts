declare module 'meross-cloud' {
import { EventEmitter } from 'events'
import { MqttClient } from 'mqtt'

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
  
  export interface GetControlPowerConsumptionXResponse {
    consumptionx: {
      date: string
      /**
      * timestamp, utc.
      * has to be multiplied by 1000 to use on new Date(time)
      */
      time: number
      value: number
    }[]
  }
  export interface GetControlElectricityResponse {
    electricity: {
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

    connect(): void
    disconnect(force: boolean): void

    on(event: DeviceEvents, listener: (...args: any[]) => void): this;

    publishMessage(method: 'GET' | 'SET', namespace: string, payload: any, callback?: Callback<any>): number
    publishMessage(method: 'GET' | 'SET', namespace: string, payload: any): Promise<any>

    getSystemAllData(callback: Callback<any>): number
    getSystemAllData(): Promise<void>
    getSystemDebug(callback: Callback<any>): number
    getSystemDebug(): Promise<void>
    getSystemAbilities(callback: Callback<any>): number
    getSystemAbilities(): Promise<void>
    getSystemReport(callback: Callback<any>): number
    getSystemReport(): Promise<void>
    getSystemRuntime(callback: Callback<any>): number
    getSystemRuntime(): Promise<void>
    getSystemDNDMode(callback: Callback<any>): number
    getSystemDNDMode(): Promise<void>
    getOnlineStatus(callback: Callback<any>): number
    getOnlineStatus(): Promise<void>
    getConfigWifiList(callback: Callback<any>): number
    getConfigWifiList(): Promise<void>
    getConfigTrace(callback: Callback<any>): number
    getConfigTrace(): Promise<void>
    getControlPowerConsumption(callback: Callback<any>): number
    getControlPowerConsumption(): Promise<void>
    getControlPowerConsumptionX(callback: Callback<GetControlPowerConsumptionXResponse>): number
    getControlPowerConsumptionX(): Promise<GetControlPowerConsumptionXResponse>
    getControlElectricity(callback: Callback<GetControlElectricityResponse>): number
    getControlElectricity(): Promise<GetControlElectricityResponse>
    
    controlToggle(onoff: boolean, callback: Callback<any>): number
    controlToggleX(channel: any, onoff: boolean, callback: Callback<any>): number
    controlSpray(channel: any, mode: number, callback: Callback<any>): number
    controlGarageDoor(channel: any, open: boolean, callback: Callback<any>): number
    controlLight(light: any, callback: Callback<any>): number
    setSystemDNDMode(onoff: boolean, callback: Callback<any>): number
  }
  
  export default MerossCloud
}
