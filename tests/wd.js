#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const bonjour = require('bonjour')();
const qrcode = require('qrcode-terminal');

const ADB_PATH = path.join(__dirname, '..', 'adb', 'win-x64', 'adb.exe');
const NAME = 'ADB_WIFI';
const PASSWORD = '000000';

let deviceAddress = null;
let devicePorts = [];

function generateQr() {
    const qrText = `WIFI:T:ADB;S:${NAME};P:${PASSWORD};;`;
    qrcode.generate(qrText, { small: true });
}

function runAdbCommand(args) {
    return new Promise((resolve, reject) => {
        const adb = spawn(ADB_PATH, args);
        let output = '';
        let errorOutput = '';

        adb.stdout.on('data', (data) => {
            output += data.toString().trim();
        });

        adb.stderr.on('data', (data) => {
            errorOutput += data.toString().trim();
        });

        adb.on('close', (code) => {
            if (code === 0) {
                resolve(output);
            } else {
                reject(new Error(errorOutput));
            }
        });
    });
}

function getIPv4Address(service) {
    if (service.addresses && service.addresses.length > 0) {
        for (let addr of service.addresses) {
            if (addr.indexOf(':') === -1) {
                return addr;
            }
        }
    }
    return null;
}

async function pairAndConnect(address, pairingPort, connectPort) {
    try {
        console.log('Pairing...');
        await runAdbCommand(['pair', `${address}:${pairingPort}`, PASSWORD]);

        console.log('Connecting...');
        await runAdbCommand(['connect', `${address}:${connectPort}`]);

        console.log('Success! Device connected.');
        bonjour.destroy();
        process.exit(0);
    } catch (error) {
        console.log('Connection failed. Please check wireless debugging is enabled.');
        bonjour.destroy();
        process.exit(1);
    }
}

function main() {
    console.log('Wireless ADB Tool\n');
    generateQr();
    console.log(`\nNetwork: ${NAME}`);
    console.log(`Password: ${PASSWORD}\n`);
    console.log('Waiting for device...\n');

    bonjour.find({ type: 'adb-tls-connect' }, function (service) {
        const address = getIPv4Address(service);
        if (address) {
            console.log(`Found connect service: ${address}:${service.port}`);
            if (!deviceAddress) {
                deviceAddress = address;
            }
            devicePorts.push(service.port);
        }
    });

    bonjour.find({ type: 'adb-tls-pairing' }, function (service) {
        const address = getIPv4Address(service);
        if (address) {
            console.log(`Found pairing service: ${address}:${service.port}`);

            if (!deviceAddress) {
                deviceAddress = address;
            }

            if (devicePorts.length > 0) {
                pairAndConnect(deviceAddress, service.port, devicePorts[0]);
            } else {
                console.log('Waiting for connect service...');
            }
        }
    });

    setTimeout(() => {
        if (!deviceAddress) {
            console.log('No device found. Please check:');
            console.log('1. Phone and computer on same network');
            console.log('2. Wireless debugging enabled on phone');
            console.log('3. Firewall not blocking connection');
            bonjour.destroy();
            process.exit(1);
        }
    }, 30000);

    process.on('SIGINT', () => {
        console.log('\nCancelled');
        bonjour.destroy();
        process.exit(0);
    });
}

if (require.main === module) {
    main();
}