<h1 align="center">
  <img alt="SemBeacon" src="https://sembeacon.org/images/logo.svg" width="30%" /><br />
  <img alt="OpenHPS" src="https://openhps.org/images/logo_text-512.png" width="20%" /><br />
  @sembeacon/openhps
</h1>
<p align="center">
    <a href="https://github.com/SemBeacon/openhps/actions/workflows/main.yml" target="_blank">
        <img alt="Build Status" src="https://github.com/SemBeacon/openhps/actions/workflows/main.yml/badge.svg">
    </a>
    <a href="https://codecov.io/gh/SemBeacon/openhps">
        <img src="https://codecov.io/gh/SemBeacon/openhps/branch/master/graph/badge.svg?token=U896HUBDCZ"/>
    </a>
    <a href="https://codeclimate.com/github/SemBeacon/openhps/" target="_blank">
        <img alt="Maintainability" src="https://img.shields.io/codeclimate/maintainability/SemBeacon/openhps">
    </a>
    <a href="https://badge.fury.io/js/@sembeacon%2Fopenhps">
        <img src="https://badge.fury.io/js/@sembeacon%2Fopenhps.svg" alt="npm version" height="18">
    </a>
</p>

<h3 align="center">
    <a href="https://github.com/SemBeacon/openhps">@sembeacon/openhps</a> &mdash; <a href="https://openhps.org/docs/sembeacon">API</a>
</h3>

<br />

This repository contains the SemBeacon module for OpenHPS.

## Getting Started
If you have [npm installed](https://www.npmjs.com/get-npm), start using @sembeacon/openhps with the following command.
```bash
npm install @sembeacon/openhps --save
```

## Usage

### Parsing from payload
```typescript
 const payload = new Uint8Array([
      2, 1, 6, 27, 255, 76, 0, 190, 172, 253, 165, 6, 147, 164, 226, 79, 177, 175, 207, 198, 235, 7, 100, 120, 37, 139,
      29, 11, 60, 200, 0, 22, 22, 170, 254, 16, 241, 3, 116, 105, 110, 121, 117, 114, 108, 0, 53, 55, 109, 98, 98, 120,
      50, 119, 0, 0, 0, 0, 0, 0, 0, 0,
]);

// Converts a payload to beacon object
const beacon = new BLESemBeacon();
beacon.parseAdvertisement(payload);
```

### Builder
```typescript
BLESemBeaconBuilder.create()
    .instanceId('c187d748')
    .calibratedRSSI(-56)
    .resourceUri('https://bit.ly/3JsEnF9')
    .build();
```

## Contributors
The framework is open source and is mainly developed by PhD Student Maxim Van de Wynckel as part of his research towards *Interoperable and Discoverable Indoor Positioning Systems* under the supervision of Prof. Dr. Beat Signer.

## Contributing
Use of OpenHPS, SemBeacon, contributions and feedback is highly appreciated. Please read our [contributing guidelines](CONTRIBUTING.md) for more information.

## License
Copyright (C) 2019-2025 Maxim Van de Wynckel & Vrije Universiteit Brussel

Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at

https://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.