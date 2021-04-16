import { createHash } from 'crypto'
import { EventEmitter } from 'events'
import { connect as mqttConnect, MqttClient } from 'mqtt'
import { timeout } from 'promise-timeout'

import { DeviceDefinition, MerossMessage } from './interfaces'
import { generateRandomString } from './utils'

type DeviceStatus = 'init' | 'online' | 'offline'
type PromiseResolver = (value?: unknown) => void
type MessageResolver = (msg: MerossMessage<any>) => void

export class MerossCloudDevice extends EventEmitter {

    clientResponseTopic: string | null
    waitingMessageIds: Record<string, MessageResolver>

    token: string
    key: string
    userId: string
    dev: DeviceDefinition

    COMMAND_TIMEOUT: number
    status: DeviceStatus
    queuedCommands: Array<PromiseResolver>

    client!: MqttClient

    constructor (token: string, key: string, userId: string, dev: DeviceDefinition) {
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
      const appId = createHash('md5').update('API' + this.dev.uuid).digest('hex')
      const clientId = 'app:' + appId

      // Password is calculated as the MD5 of USERID concatenated with KEY
      const hashedPassword = createHash('md5').update(this.userId + this.key).digest('hex')

      this.client = mqttConnect({
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
              if (resolveFn != null) resolveFn()
          }
      })

      this.client.on('message', (topic, message) => {
          if (!message) return
          // message is Buffer
          // console.log(topic + ' <-- ' + message.toString());
          const decodedMessage = JSON.parse(message.toString()) as MerossMessage<any>
          if (decodedMessage.header.from && !decodedMessage.header.from.includes(this.dev.uuid)) return
          // {"header":{"messageId":"14b4951d0627ea904dd8685c480b7b2e","namespace":"Appliance.Control.ToggleX","method":"PUSH","payloadVersion":1,"from":"/appliance/1806299596727829081434298f15a991/publish","timestamp":1539602435,"timestampMs":427,"sign":"f33bb034ac2d5d39289e6fa3dcead081"},"payload":{"togglex":[{"channel":0,"onoff":0,"lmTime":1539602434},{"channel":1,"onoff":0,"lmTime":1539602434},{"channel":2,"onoff":0,"lmTime":1539602434},{"channel":3,"onoff":0,"lmTime":1539602434},{"channel":4,"onoff":0,"lmTime":1539602434}]}}

          // if the payload has only one value, flatten it
          if (decodedMessage.payload && typeof decodedMessage.payload === 'object') {
              const keys = Object.keys(decodedMessage.payload)
              if (keys.length === 1) decodedMessage.payload = decodedMessage.payload[keys[0]]
          }

          // If the message is the RESP for some previous action, process return the control to the "stopped" method.
          const resolveForThisMessage = this.waitingMessageIds[decodedMessage.header.messageId]
          if (resolveForThisMessage != null) {
              resolveForThisMessage(decodedMessage)
              delete this.waitingMessageIds[decodedMessage.header.messageId]
          } else if (decodedMessage.header.method === 'PUSH') { // Otherwise process it accordingly
              const namespace = decodedMessage.header ? decodedMessage.header.namespace : ''
              this.emit('data', namespace, message)
          }
          this.emit('rawData', message)
      })
      this.client.on('error', (error) => {
          this.emit('error', error ? error.toString() : null)
      })
      this.client.on('close', () => {
          this.emit('close')
          this.status = 'offline'
      })
      this.client.on('reconnect', () => {
          this.emit('reconnect')
          this.status = 'offline'
      })

      // mqtt.Client#end([force], [options], [cb])
      // mqtt.Client#reconnect()
  }

  disconnect (force: boolean) {
      this.client.end(force)
  }

  async publishMessage (method: 'GET' | 'SET', namespace: string, payload: any): Promise<MerossMessage<any>> {
      // helper to queue commands before the device is connected
      if (this.status !== 'online') {
          let connectResolve: PromiseResolver
          // we create a idle promise - connectPromise
          const connectPromise = new Promise((resolve) => { connectResolve = resolve })
          // connectPromise will get resolved when the device connects
          this.queuedCommands.push(connectResolve!)
          // when the device is connected, the futureCommand will be executed
          // that is exactly the same command issued now, but in the future
          const futureCommand = () => this.publishMessage(method, namespace, payload)
          // we return immediately an 'idle' promise, that when it gets resolved
          // it will then execute the futureCommand
          // IF the above takes too much time, the command will fail with a TimeoutError
          return timeout(connectPromise.then(futureCommand), this.COMMAND_TIMEOUT)
      }

      let commandResolve: MessageResolver
      // create of an waiting Promise, it will get (maybe) resolved if the device
      // responds in time
      const commandPromise = new Promise<MerossMessage<any>>((resolve) => { commandResolve = resolve })

      // if not subscribed und so ...
      const messageId = createHash('md5').update(generateRandomString(16)).digest('hex')
      const timestamp = Math.round(new Date().getTime() / 1000) // int(round(time.time()))

      const signature = createHash('md5').update(messageId + this.key + timestamp).digest('hex')

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
      this.waitingMessageIds[messageId] = commandResolve!
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

  setSystemDNDMode (onoff: boolean) {
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

  async controlToggle (onoff: boolean) {
      const payload = { toggle: { onoff: onoff ? 1 : 0 } }
      return this.publishMessage('SET', 'Appliance.Control.Toggle', payload)
  }

  async controlToggleX (channel: string, onoff: boolean) {
      const payload = { togglex: { channel, onoff: onoff ? 1 : 0 } }
      return this.publishMessage('SET', 'Appliance.Control.ToggleX', payload)
  }

  async controlSpray (channel: string, mode: any) {
      const payload = { spray: { channel, mode: mode || 0 } }
      return this.publishMessage('SET', 'Appliance.Control.Spray', payload)
  }

  async controlGarageDoor (channel: string, open: boolean) {
      const payload = { state: { channel, open: open ? 1 : 0, uuid: this.dev.uuid } }
      return this.publishMessage('SET', 'Appliance.GarageDoor.State', payload)
  }

  // {"light":{"capacity":6,"channel":0,"rgb":289,"temperature":80,"luminance":100}}
  async controlLight (light: any) {
      const payload = { light: light }
      return this.publishMessage('SET', 'Appliance.Control.Light', payload)
  }
}
