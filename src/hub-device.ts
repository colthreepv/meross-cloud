import { DeviceDefinition } from './interfaces'
import { MerossCloudDevice } from './meross-device'

export class MerossCloudHubDevice extends MerossCloudDevice {
    subDeviceList: any[]

    constructor (token: string, key: string, userId: string, dev: DeviceDefinition, subDeviceList: any) {
        super(token, key, userId, dev)

        this.subDeviceList = subDeviceList
    }

    async getHubBattery () {
        const payload = { battery: [] }
        return this.publishMessage('GET', 'Appliance.Hub.Battery', payload)
    }

    async getMts100All (ids: any[]) {
        const payload = { all: [] as any[] }
        ids.forEach(id => payload.all.push({ id }))
        return this.publishMessage('GET', 'Appliance.Hub.Mts100.All', payload)
    }

    async controlHubToggleX (subId: any, onoff: boolean) {
        const payload = { togglex: [{ id: subId, onoff: onoff ? 1 : 0 }] }
        return this.publishMessage('SET', 'Appliance.Hub.ToggleX', payload)
    }

    async controlHubMts100Mode (subId: any, mode: string) {
        const payload = { mode: [{ id: subId, state: mode }] }
        return this.publishMessage('SET', 'Appliance.Hub.Mts100.Mode', payload)
    }

    async controlHubMts100Temperature (subId: any, temp: any) {
        temp.id = subId
        const payload = { temperature: [temp] }
        return this.publishMessage('SET', 'Appliance.Hub.Mts100.Temperature', payload)
    }
}
