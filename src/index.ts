import { createHash } from 'crypto'
import { EventEmitter } from 'events'
import got, { OptionsOfJSONResponseBody as GotOptions } from 'got/dist/source'
import { TimeoutError } from 'promise-timeout'

import { MerossCloudHubDevice } from './hub-device'
import {
  CloudOptions, DeviceDefinition, DevListResponse, GenericMerossResponse, LoginResponse,
} from './interfaces'
import { MerossCloudDevice } from './meross-device'
import { encodeParams, generateRandomString } from './utils'

const SECRET = '23x17ahWarFH6w29'
const MEROSS_URL = 'https://iot.meross.com'
const LOGIN_URL = MEROSS_URL + '/v1/Auth/Login'
const DEV_LIST = MEROSS_URL + '/v1/Device/devList'
const SUBDEV_LIST = MEROSS_URL + '/v1/Hub/getSubDevices'

class MerossCloud extends EventEmitter {
    options: CloudOptions
    token: string | null
    key: string | null
    userId: string | null
    userEmail: string | null
    authenticated: boolean
    devices: Record<string, MerossCloudDevice>

    constructor (options: CloudOptions) {
        super()

        this.options = options || {}
        this.token = null
        this.key = null
        this.userId = null
        this.userEmail = null
        this.authenticated = false

        this.devices = {}
    }

    async authenticatedPost <T = unknown> (url: string, paramsData: Object) {
        const nonce = generateRandomString(16)
        const timestampMillis = Date.now()
        const loginParams = encodeParams(paramsData)

        // Generate the md5-hash (called signature)
        const datatosign = SECRET + timestampMillis + nonce + loginParams
        const md5hash = createHash('md5').update(datatosign).digest('hex')
        const headers = {
            Authorization: 'Basic ' + (this.token || ''),
            vender: 'Meross',
            AppVersion: '1.3.0',
            AppLanguage: 'EN',
            'User-Agent': 'okhttp/3.6.0'
        }

        const payload = {
            params: loginParams,
            sign: md5hash,
            timestamp: timestampMillis,
            nonce: nonce
        }

        const options: GotOptions = {
            method: 'POST',
            headers: headers,
            form: payload,
            responseType: 'json'
        }
        this.options.logger && this.options.logger('HTTP-Call: ' + JSON.stringify(options))
        // Perform the request.
        const response = await got<GenericMerossResponse<T>>(url)

        if(response.statusCode !== 200 || response.body == null) throw new Error(`HTTP-Response Code: ${response.statusCode}`)
        this.options.logger && this.options.logger('HTTP-Response OK: ' + response.rawBody.toString())

        const { body } = response
        if (body.info !== 'Success') throw new Error(`apiStatus: ${body.apiStatus}: ${body.info}`)
        return body.data
    }

    connectDevice(deviceId: string, deviceObj: MerossCloudDevice, dev: DeviceDefinition): MerossCloudDevice {
        this.devices[deviceId] = deviceObj
        deviceObj.on('connected', () => this.emit('connected', deviceId))
        deviceObj.on('close', (error) => this.emit('close', deviceId, error))
        deviceObj.on('error', (error) => {
            if (!this.listenerCount('error')) return
            this.emit('error', deviceId, error)
        })
        deviceObj.on('reconnect', () => this.emit('reconnect', deviceId))
        deviceObj.on('data', (namespace, payload) => this.emit('data', deviceId, namespace, payload))
        deviceObj.on('rawData', (message) => this.emit('rawData', deviceId, message))
        this.emit('deviceInitialized', deviceId, dev, deviceObj)
        deviceObj.connect()
        return deviceObj
    }

    async connect () {
        const data = {
            email: this.options.email,
            password: this.options.password
        }

        const loginResponse = await this.authenticatedPost<LoginResponse>(LOGIN_URL, data)

        this.token = loginResponse.token
        this.key = loginResponse.key
        this.userId = loginResponse.userid
        this.userEmail = loginResponse.email
        this.authenticated = true

        return await this.getDeviceList()
    }

    async getDeviceList () {
        if (this.authenticated === false) throw new Error('Not authenticated yet')
        const deviceList = await this.authenticatedPost<DevListResponse>(DEV_LIST, {})
        if (deviceList == null || !Array.isArray(deviceList)) throw new Error('Unexpected response from meross servers')
        // promise array of devices
        // this is useful to return either a value or a Promise of a value,
        // in this case the 'value' is a MerossCloudDevice
        const devices = deviceList.map(async (dev) => {
            if (dev.deviceType === 'msh300') {
                this.options.logger && this.options.logger(dev.uuid + ' Detected Hub')

                const subDeviceList = await this.authenticatedPost(SUBDEV_LIST, { uuid: dev.uuid })
                return this.connectDevice(
                    dev.uuid,
                    new MerossCloudHubDevice(this.token!, this.key!, this.userId!, dev, subDeviceList),
                    dev
                )
            }
            return this.connectDevice(dev.uuid, new MerossCloudDevice(this.token!, this.key!, this.userId!, dev), dev)
        })

        return Promise.all(devices)
    }

    getDevice (uuid: string) {
        return this.devices[uuid]
    }

    disconnectAll (force: boolean) {
        for (const deviceId in this.devices) {
            if (!Object.prototype.hasOwnProperty.call(this.devices, deviceId)) continue
            this.devices[deviceId].disconnect(force)
        }
    }
}




exports = module.exports = MerossCloud
exports.TimeoutError = TimeoutError
