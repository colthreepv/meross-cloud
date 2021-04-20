**THIS IS A FORK OF** [meross-cloud][meross-npm] [(github)][meross-github]  
# meross-cloud-ts 
Library that allows to login into Meross cloud server, read the registered devices and open connections to the MQTT cloud server to get the datatosign

[meross-npm]: https://www.npmjs.com/package/meross-cloud
[meross-github]: https://github.com/Apollon77/meross-cloud

## Example
see [example folder](example)

## Todo
* FIX TESTS
* FIX EXAMPLES

## Credits
The library is partially based on the Python project https://github.com/albertogeniola/MerossIot, Thank you for this great basic work on how to connect to the Meross Cloud Servers

## Technical details
Meross cloud services work in combination of MQTT and REST API, clients connects to MQTT, then commands gets issued
through a list of REST API.  
Those commands get the appropriate response through MQTT channel

## Changelog

### 2.0.0 (2021)
* Typescript adaptation (just added types, not rewrite)
* Split in multiple files relative to the classes
* No callbacks, only Promises (it's 2021, sorry!)
* If requested command does not receive a response, generates a [Timeout error][timeout-npm]

[timeout-npm]: https://www.npmjs.com/package/promise-timeout
