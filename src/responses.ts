export interface ConsumptionXResponse {
    date: string
    /**
    * timestamp, utc.
    * has to be multiplied by 1000 to use on new Date(time)
    */
    time: number
    value: number
}

export interface ElectricityResponse {
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
