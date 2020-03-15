const mqtt = require('mqtt')
const crypto = require('crypto')
const request = require('request')
const EventEmitter = require('events')
const { timeout, TimeoutError } = require('promise-timeout')

const SECRET = '23x17ahWarFH6w29'
const MEROSS_URL = 'https://iot.meross.com'
const LOGIN_URL = MEROSS_URL + '/v1/Auth/Login'
const DEV_LIST = MEROSS_URL + '/v1/Device/devList'
const SUBDEV_LIST = MEROSS_URL + '/v1/Hub/getSubDevices'

function generateRandomString (length) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
    let nonce = ''
    while (nonce.length < length) {
        nonce += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return nonce
}

function encodeParams (parameters) {
    const jsonstring = JSON.stringify(parameters)
    return Buffer.from(jsonstring).toString('base64')
}

class MerossCloud extends EventEmitter {
    /*
        email
        password
    */

    constructor (options) {
        super()

        this.options = options || {}
        this.token = null
        this.key = null
        this.userId = null
        this.userEmail = null
        this.authenticated = false

        this.devices = {}
    }

    authenticatedPost (url, paramsData, callback) {
        const func = this.authenticatedPost.bind(this)
        if (callback === undefined) {
            return new Promise((resolve, reject) => {
                func(url, paramsData, (err, result) => {
                    err ? reject(err) : resolve(result)
                })
            })
        }

        const nonce = generateRandomString(16)
        const timestampMillis = Date.now()
        const loginParams = encodeParams(paramsData)

        // Generate the md5-hash (called signature)
        const datatosign = SECRET + timestampMillis + nonce + loginParams
        const md5hash = crypto.createHash('md5').update(datatosign).digest('hex')
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

        const options = {
            url: url,
            method: 'POST',
            headers: headers,
            form: payload
        }
        this.options.logger && this.options.logger('HTTP-Call: ' + JSON.stringify(options))
        // Perform the request.
        request(options, (error, response, body) => {
            if (!error && response && response.statusCode === 200 && body) {
                this.options.logger && this.options.logger('HTTP-Response OK: ' + body)
                try {
                    body = JSON.parse(body)
                } catch (err) {
                    body = {}
                }

                if (body.info === 'Success') {
                    return callback && callback(null, body.data)
                }
                return callback && callback(new Error(body.apiStatus + ': ' + body.info))
            }
            this.options.logger && this.options.logger('HTTP-Response Error: ' + error + ' / Status=' + (response ? response.statusCode : '--'))
            return callback && callback(error)
        })
    }

    connectDevice (deviceId, deviceObj, dev) {
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

    async connect (callback) {
        const func = this.connect.bind(this)
        if (callback === undefined) {
            return new Promise((resolve, reject) => {
                func((err, result) => {
                    err ? reject(err) : resolve(result)
                })
            })
        }

        const data = {
            email: this.options.email,
            password: this.options.password
        }

        let loginResponse
        try {
            loginResponse = await this.authenticatedPost(LOGIN_URL, data)
        } catch (err) {
            callback && callback(err)
            return
        }
        this.token = loginResponse.token
        this.key = loginResponse.key
        this.userId = loginResponse.userid
        this.userEmail = loginResponse.email
        this.authenticated = true

        const deviceList = await this.authenticatedPost(DEV_LIST, {})
        if (deviceList == null || !Array.isArray(deviceList)) {
            callback(new Error('Unexpected response from meross servers'))
            return
        }
        // promise array of devices
        // this is useful to return either a value or a Promise of a value,
        // in this case the 'value' is a MerossCloudDevice
        const devices = await Promise.all(deviceList.map(async (dev) => {
            if (dev.deviceType === 'msh300') {
                this.options.logger && this.options.logger(dev.uuid + ' Detected Hub')

                const subDeviceList = await this.authenticatedPost(SUBDEV_LIST, { uuid: dev.uuid })
                return this.connectDevice(
                    dev.uuid,
                    new MerossCloudHubDevice(this.token, this.key, this.userId, dev, subDeviceList),
                    dev
                )
            }
            return this.connectDevice(dev.uuid, new MerossCloudDevice(this.token, this.key, this.userId, dev), dev)
        }))
        callback(null, devices)

        /*

        /app/64416/subscribe <-- {"header":{"messageId":"b5da1e168cba7a681afcff82eaf703c8","namespace":"Appliance.System.Online","timestamp":1539614195,"method":"PUSH","sign":"b16c2c4cbb5acf13e6b94990abf5b140","from":"/appliance/1806299596727829081434298f15a991/subscribe","payloadVersion":1},"payload":{"online":{"status":2}}}
        /app/64416/subscribe <-- {"header":{"messageId":"4bf5dfaaa0898243a846c1f2a93970fe","namespace":"Appliance.System.Online","timestamp":1539614201,"method":"PUSH","sign":"f979692120e7165b2116abdfd464ca83","from":"/appliance/1806299596727829081434298f15a991/subscribe","payloadVersion":1},"payload":{"online":{"status":1}}}
        /app/64416/subscribe <-- {"header":{"messageId":"46182b62a9377a8cc0147f22262a23f3","namespace":"Appliance.System.Report","method":"PUSH","payloadVersion":1,"from":"/appliance/1806299596727829081434298f15a991/publish","timestamp":1539614201,"timestampMs":78,"sign":"048fad34ca4d00875a026e33b16caf1b"},"payload":{"report":[{"type":"1","value":"0","timestamp":1539614201}]}}
        TIMEOUT
        err: Error: Timeout, res: undefined
        /app/64416/subscribe <-- {"header":{"messageId":"8dbe0240b2c03dcefda87a758a228d21","namespace":"Appliance.Control.ToggleX","method":"PUSH","payloadVersion":1,"from":"/appliance/1806299596727829081434298f15a991/publish","timestamp":1539614273,"timestampMs":27,"sign":"0f1ab22db05842eb94714b669b911aff"},"payload":{"togglex":{"channel":1,"onoff":1,"lmTime":1539614273}}}
        /app/64416/subscribe <-- {"header":{"messageId":"6ecacf6453bb0a4256f8bf1f5dd1d835","namespace":"Appliance.Control.ToggleX","method":"PUSH","payloadVersion":1,"from":"/appliance/1806299596727829081434298f15a991/publish","timestamp":1539614276,"timestampMs":509,"sign":"b8281d71ef8ab5420a1382af5ff9fc34"},"payload":{"togglex":{"channel":1,"onoff":0,"lmTime":1539614276}}}

        {"header":{"messageId":"98fee66789f75eb0e149f2a5116f919c","namespace":"Appliance.Control.ToggleX","method":"PUSH","payloadVersion":1,"from":"/appliance/1806299596727829081434298f15a991/publish","timestamp":1539633281,"timestampMs":609,"sign":"dd6bf3acee81a6c46f6fedd02515ddf3"},"payload":{"togglex":[{"channel":0,"onoff":0,"lmTime":1539633280},{"channel":1,"onoff":0,"lmTime":1539633280},{"channel":2,"onoff":0,"lmTime":1539633280},{"channel":3,"onoff":0,"lmTime":1539633280},{"channel":4,"onoff":0,"lmTime":1539633280}]}}
        */
    }

    getDevice (uuid) {
        return this.devices[uuid]
    }

    disconnectAll (force) {
        for (const deviceId in this.devices) {
            if (!Object.prototype.hasOwnProperty.call(this.devices, deviceId)) continue
            this.devices[deviceId].disconnect(force)
        }
    }
}

class MerossCloudDevice extends EventEmitter {
    constructor (token, key, userId, dev) {
        super()

        this.clientResponseTopic = null
        this.waitingMessageIds = {}

        this.token = token
        this.key = key
        this.userId = userId
        this.dev = dev

        this.COMMAND_TIMEOUT = 20 * 1000
        this.status = 'init'
        this.queuedCommands = []
    }

    connect () {
        const domain = this.dev.domain || 'eu-iot.meross.com'
        const appId = crypto.createHash('md5').update('API' + this.dev.uuid).digest('hex')
        const clientId = 'app:' + appId

        // Password is calculated as the MD5 of USERID concatenated with KEY
        const hashedPassword = crypto.createHash('md5').update(this.userId + this.key).digest('hex')

        this.client = mqtt.connect({
            protocol: 'mqtts',
            host: domain,
            port: 2001,
            clientId: clientId,
            username: this.userId,
            password: hashedPassword,
            rejectUnauthorized: true,
            keepalive: 30,
            reconnectPeriod: 5000
        })

        this.client.on('connect', () => {
            // console.log("Connected. Subscribe to user topics");

            this.client.subscribe('/app/' + this.userId + '/subscribe', (err) => {
                if (err) {
                    this.emit('error', err)
                }
                // console.log('User Subscribe Done');
            })

            this.clientResponseTopic = '/app/' + this.userId + '-' + appId + '/subscribe'

            this.client.subscribe(this.clientResponseTopic, (err) => {
                if (err) {
                    this.emit('error', err)
                }
                // console.log('User Response Subscribe Done');
            })
            this.emit('connected')
            this.status = 'online'
            while (this.queuedCommands.length > 0) {
                const resolveFn = this.queuedCommands.pop()
                resolveFn()
            }
        })

        this.client.on('message', (topic, message) => {
            if (!message) return
            // message is Buffer
            // console.log(topic + ' <-- ' + message.toString());
            message = JSON.parse(message.toString())
            if (message.header.from && !message.header.from.includes(this.dev.uuid)) return
            // {"header":{"messageId":"14b4951d0627ea904dd8685c480b7b2e","namespace":"Appliance.Control.ToggleX","method":"PUSH","payloadVersion":1,"from":"/appliance/1806299596727829081434298f15a991/publish","timestamp":1539602435,"timestampMs":427,"sign":"f33bb034ac2d5d39289e6fa3dcead081"},"payload":{"togglex":[{"channel":0,"onoff":0,"lmTime":1539602434},{"channel":1,"onoff":0,"lmTime":1539602434},{"channel":2,"onoff":0,"lmTime":1539602434},{"channel":3,"onoff":0,"lmTime":1539602434},{"channel":4,"onoff":0,"lmTime":1539602434}]}}

            // if the payload has only one value, flatten it
            if (message.payload && typeof message.payload === 'object') {
                const keys = Object.keys(message.payload)
                if (keys.length === 1) message.payload = message.payload[keys[0]]
            }

            // If the message is the RESP for some previous action, process return the control to the "stopped" method.
            const resolveForThisMessage = this.waitingMessageIds[message.header.messageId]
            if (resolveForThisMessage != null) {
                resolveForThisMessage(message)
                delete this.waitingMessageIds[message.header.messageId]
            } else if (message.header.method === 'PUSH') { // Otherwise process it accordingly
                const namespace = message.header ? message.header.namespace : ''
                this.emit('data', namespace, message)
            }
            this.emit('rawData', message)
        })
        this.client.on('error', (error) => {
            this.emit('error', error ? error.toString() : null)
        })
        this.client.on('close', (error) => {
            this.emit('close', error ? error.toString() : null)
            this.status = 'offline'
        })
        this.client.on('reconnect', () => {
            this.emit('reconnect')
            this.status = 'offline'
        })

        // mqtt.Client#end([force], [options], [cb])
        // mqtt.Client#reconnect()
    }

    disconnect (force) {
        this.client.end(force)
    }

    async publishMessage (method, namespace, payload) {
        // helper to queue commands before the device is connected
        if (this.status !== 'online') {
            let connectResolve
            // we create a idle promise - connectPromise
            const connectPromise = new Promise((resolve) => { connectResolve = resolve })
            // connectPromise will get resolved when the device connects
            this.queuedCommands.push(connectResolve)
            // when the device is connected, the futureCommand will be executed
            // that is exactly the same command issued now, but in the future
            const futureCommand = () => this.publishMessage(method, namespace, payload)
            // we return immediately an 'idle' promise, that when it gets resolved
            // it will then execute the futureCommand
            // IF the above takes too much time, the command will fail with a TimeoutError
            return timeout(connectPromise.then(futureCommand), this.COMMAND_TIMEOUT)
        }

        let commandResolve
        // create of an waiting Promise, it will get (maybe) resolved if the device
        // responds in time
        const commandPromise = new Promise((resolve) => { commandResolve = resolve })

        // if not subscribed und so ...
        const messageId = crypto.createHash('md5').update(generateRandomString(16)).digest('hex')
        const timestamp = Math.round(new Date().getTime() / 1000) // int(round(time.time()))

        const signature = crypto.createHash('md5').update(messageId + this.key + timestamp).digest('hex')

        const data = {
            header: {
                from: this.clientResponseTopic,
                messageId: messageId, // Example: "122e3e47835fefcd8aaf22d13ce21859"
                method: method, // Example: "GET",
                namespace: namespace, // Example: "Appliance.System.All",
                payloadVersion: 1,
                sign: signature, // Example: "b4236ac6fb399e70c3d61e98fcb68b74",
                timestamp: timestamp
            },
            payload: payload
        }
        this.client.publish('/appliance/' + this.dev.uuid + '/subscribe', JSON.stringify(data))
        this.emit('rawSendData', data)

        // the resolving function gets saved in the messageId database
        this.waitingMessageIds[messageId] = commandResolve
        // the command returns with a timeout
        return timeout(commandPromise, this.COMMAND_TIMEOUT)
    }

    async getSystemAllData () {
        // {"all":{"system":{"hardware":{"type":"mss425e","subType":"eu","version":"2.0.0","chipType":"mt7682","uuid":"1806299596727829081434298f15a991","macAddress":"34:29:8f:15:a9:91"},"firmware":{"version":"2.1.2","compileTime":"2018/08/13 10:42:53 GMT +08:00","wifiMac":"34:31:c4:73:3c:7f","innerIp":"192.168.178.86","server":"iot.meross.com","port":2001,"userId":64416},"time":{"timestamp":1539612975,"timezone":"Europe/Berlin","timeRule":[[1521939600,7200,1],[1540688400,3600,0],[1553994000,7200,1],[1572138000,3600,0],[1585443600,7200,1],[1603587600,3600,0],[1616893200,7200,1],[1635642000,3600,0],[1648342800,7200,1],[1667091600,3600,0],[1679792400,7200,1],[1698541200,3600,0],[1711846800,7200,1],[1729990800,3600,0],[1743296400,7200,1],[1761440400,3600,0],[1774746000,7200,1],[1792890000,3600,0],[1806195600,7200,1],[1824944400,3600,0]]},"online":{"status":1}},"digest":{"togglex":[{"channel":0,"onoff":0,"lmTime":1539608841},{"channel":1,"onoff":0,"lmTime":1539608841},{"channel":2,"onoff":0,"lmTime":1539608841},{"channel":3,"onoff":0,"lmTime":1539608841},{"channel":4,"onoff":0,"lmTime":1539608841}],"triggerx":[],"timerx":[]}}}
        return this.publishMessage('GET', 'Appliance.System.All', {})
    }

    async getSystemDebug () {
        // {"debug":{"system":{"version":"2.1.2","sysUpTime":"114h16m34s","localTimeOffset":7200,"localTime":"Mon Oct 15 16:23:03 2018","suncalc":"7:42;19:49"},"network":{"linkStatus":"connected","signal":50,"ssid":"ApollonHome","gatewayMac":"34:31:c4:73:3c:7f","innerIp":"192.168.178.86","wifiDisconnectCount":1},"cloud":{"activeServer":"iot.meross.com","mainServer":"iot.meross.com","mainPort":2001,"secondServer":"smart.meross.com","secondPort":2001,"userId":64416,"sysConnectTime":"Mon Oct 15 08:06:40 2018","sysOnlineTime":"6h16m23s","sysDisconnectCount":5,"pingTrace":[]}}}
        return this.publishMessage('GET', 'Appliance.System.Debug', {})
    }

    async getSystemAbilities () {
        // {"payloadVersion":1,"ability":{"Appliance.Config.Key":{},"Appliance.Config.WifiList":{},"Appliance.Config.Wifi":{},"Appliance.Config.Trace":{},"Appliance.System.All":{},"Appliance.System.Hardware":{},"Appliance.System.Firmware":{},"Appliance.System.Debug":{},"Appliance.System.Online":{},"Appliance.System.Time":{},"Appliance.System.Ability":{},"Appliance.System.Runtime":{},"Appliance.System.Report":{},"Appliance.System.Position":{},"Appliance.System.DNDMode":{},"Appliance.Control.Multiple":{"maxCmdNum":5},"Appliance.Control.ToggleX":{},"Appliance.Control.TimerX":{"sunOffsetSupport":1},"Appliance.Control.TriggerX":{},"Appliance.Control.Bind":{},"Appliance.Control.Unbind":{},"Appliance.Control.Upgrade":{},"Appliance.Digest.TriggerX":{},"Appliance.Digest.TimerX":{}}}
        return this.publishMessage('GET', 'Appliance.System.Ability', {})
    }

    async getSystemReport () {
        return this.publishMessage('GET', 'Appliance.System.Report', {})
    }

    async getSystemRuntime () { // Wifi Strength
        // "payload": {
        //   "runtime": {
        //    "signal": 86
        //   }
        //  }
        return this.publishMessage('GET', 'Appliance.System.Runtime', {})
    }

    async getSystemDNDMode () { // DND Mode (LED)
        // "payload": {
        //   "DNDMode": {
        //    "mode": 0
        //   }
        //  }
        return this.publishMessage('GET', 'Appliance.System.DNDMode', {})
    }

    setSystemDNDMode (onoff) {
        const payload = { DNDMode: { mode: onoff ? 1 : 0 } }
        return this.publishMessage('SET', 'Appliance.System.DNDMode', payload)
    }

    async getOnlineStatus () {
        return this.publishMessage('GET', 'Appliance.System.Online', {})
    }

    async getConfigWifiList () {
        // {"wifiList":[]}
        return this.publishMessage('GET', 'Appliance.Config.WifiList', {})
    }

    async getConfigTrace () {
        // {"trace":{"ssid":"","code":0,"info":""}}
        return this.publishMessage('GET', 'Appliance.Config.Trace', {})
    }

    async getControlPowerConsumption () {
        return this.publishMessage('GET', 'Appliance.Control.Consumption', {})
    }

    async getControlPowerConsumptionX () {
        return this.publishMessage('GET', 'Appliance.Control.ConsumptionX', {})
    }

    async getControlElectricity () {
        return this.publishMessage('GET', 'Appliance.Control.Electricity', {})
    }

    async controlToggle (onoff) {
        const payload = { toggle: { onoff: onoff ? 1 : 0 } }
        return this.publishMessage('SET', 'Appliance.Control.Toggle', payload)
    }

    async controlToggleX (channel, onoff) {
        const payload = { togglex: { channel: channel, onoff: onoff ? 1 : 0 } }
        return this.publishMessage('SET', 'Appliance.Control.ToggleX', payload)
    }

    async controlSpray (channel, mode) {
        const payload = { spray: { channel: channel, mode: mode || 0 } }
        return this.publishMessage('SET', 'Appliance.Control.Spray', payload)
    }

    async controlGarageDoor (channel, open) {
        const payload = { state: { channel: channel, open: open ? 1 : 0, uuid: this.dev.uuid } }
        return this.publishMessage('SET', 'Appliance.GarageDoor.State', payload)
    }

    // {"light":{"capacity":6,"channel":0,"rgb":289,"temperature":80,"luminance":100}}
    async controlLight (light) {
        const payload = { light: light }
        return this.publishMessage('SET', 'Appliance.Control.Light', payload)
    }
}

class MerossCloudHubDevice extends MerossCloudDevice {
    constructor (token, key, userId, dev, subDeviceList) {
        super(token, key, userId, dev)

        this.subDeviceList = subDeviceList
    }

    getHubBattery (callback) {
        const payload = { battery: [] }
        return this.publishMessage('GET', 'Appliance.Hub.Battery', payload, callback)
    }

    getMts100All (ids, callback) {
        const payload = { all: [] }
        ids.forEach(id => payload.all.push({ id: id }))
        return this.publishMessage('GET', 'Appliance.Hub.Mts100.All', payload, callback)
    }

    controlHubToggleX (subId, onoff, callback) {
        const payload = { togglex: [{ id: subId, onoff: onoff ? 1 : 0 }] }
        return this.publishMessage('SET', 'Appliance.Hub.ToggleX', payload, callback)
    }

    controlHubMts100Mode (subId, mode, callback) {
        const payload = { mode: [{ id: subId, state: mode }] }
        return this.publishMessage('SET', 'Appliance.Hub.Mts100.Mode', payload, callback)
    }

    controlHubMts100Temperature (subId, temp, callback) {
        temp.id = subId
        const payload = { temperature: [temp] }
        return this.publishMessage('SET', 'Appliance.Hub.Mts100.Temperature', payload, callback)
    }
}

exports = module.exports = MerossCloud
exports.TimeoutError = TimeoutError
