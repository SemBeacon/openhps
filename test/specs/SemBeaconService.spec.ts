import 'mocha';
import { expect } from 'chai';
import { SemBeaconService, BLESemBeaconBuilder, BLESemBeacon, ResolveResult } from '../../src/';
import { DataSerializer, MemoryDataService } from '@openhps/core';
import { BLEEddystoneURLBuilder, BLEUUID } from '@openhps/rf';
import { Store } from '@openhps/rdf';

describe('SemBeaconService', () => {
    let service: SemBeaconService;

    before((done) => {
        service = new SemBeaconService(new MemoryDataService(BLESemBeacon), {
            cors: 'https://proxy.sembeacon.org/?api=xWzD9b4eRBdWz&uri=',
            timeout: 15000
        });
        service.emitAsync('build').then(() => done()).catch(done);
    });

    describe('insert()', () => {
        it('should resolve a sembeacon and all related beacons', (done) => {
            BLESemBeaconBuilder.create()
                .namespaceId(BLEUUID.fromString('77f340db-ac0d-20e8-aa3a-f656a29f236c'))
                .instanceId('c187d748')
                .calibratedRSSI(-56)
                .shortResourceUri('https://bit.ly/3JsEnF9')
                .build().then(beacon => {
                    return service.insert(beacon.uid, beacon);
                }).then(insertedObject => {
                    expect(insertedObject.position).to.not.be.undefined;
                    expect(insertedObject.position.toVector3().x).to.not.be.undefined;
                    expect(insertedObject.position.toVector3().x).to.not.eq(0);
                    done();
                }).catch(done);
        });

        it('should resolve a sembeacon profile', (done) => {
            BLESemBeaconBuilder.create()
                .instanceId('c187d748')
                .calibratedRSSI(-56)
                .resourceUri('https://solid.maximvdw.be/profile/card#me')
                .build().then(beacon => {
                    return service.insert(beacon.uid, beacon);
                }).then((insertedObject: BLESemBeacon) => {
                    expect(insertedObject.object).to.not.be.undefined;
                    done();
                }).catch(done);
        });

        it('should resolve a sembeacon profile as rdf+xml', (done) => {
            BLESemBeaconBuilder.create()
                .instanceId('c187d748')
                .calibratedRSSI(-56)
                .resourceUri('https://beatsigner.com/foaf.rdf#me')
                .build().then(beacon => {
                    return service.insert(beacon.uid, beacon);
                }).then((insertedObject: BLESemBeacon) => {
                    expect(insertedObject.object).to.not.be.undefined;
                    done();
                }).catch(done);
        });
    });

    describe('resolve()', () => {
        it('should resolve all beacons', (done) => {
            BLESemBeaconBuilder.create()
                .namespaceId(BLEUUID.fromString('77f340db-ac0d-20e8-aa3a-f656a29f236c'))
                .instanceId('c187d748')
                .calibratedRSSI(-56)
                .shortResourceUri('https://bit.ly/3JsEnF9')
                .build().then(beacon => {
                    return service.resolve(beacon, { resolveAll: true });
                }).then(result => {
                    expect(result.result).to.not.be.undefined;
                    expect(result.beacons.length).to.eq(10);
                    result.beacons.forEach(beacon => {  
                        expect(beacon).to.not.be.undefined;
                        expect(beacon.position).to.not.be.undefined;
                        expect(beacon.position.toVector3().x).to.not.be.undefined;
                        expect(beacon.position.toVector3().x).to.not.eq(0);
                    });
                    done();
                }).catch(done);
        });

        it('should resolve an Eddystone-URL without manufacturer data', (done) => {
            BLEEddystoneURLBuilder.create()
                .url('https://bit.ly/3JsEnF9')
                .build().then(beacon => {
                    return service.insert(beacon.uid, BLESemBeacon.fromEddystoneURL(beacon));
                }).then((insertedObject: BLESemBeacon) => {
                    expect(insertedObject).to.not.be.undefined;
                    expect(insertedObject).to.be.instanceOf(BLESemBeacon);
                    done();
                }).catch(done);
        });

        it('should return serializable quads', (done) => {
            BLESemBeaconBuilder.create()
                .namespaceId(BLEUUID.fromString('77f340db-ac0d-20e8-aa3a-f656a29f236c'))
                .instanceId('c187d748')
                .calibratedRSSI(-56)
                .shortResourceUri('https://bit.ly/3JsEnF9')
                .build().then(beacon => {
                    return service.resolve(beacon, { resolveAll: true });
                }).then(result => {
                    const serialized = DataSerializer.serialize(result);
                    const deserialized: ResolveResult = DataSerializer.deserialize(serialized);
                    expect(deserialized.data).to.not.be.undefined;
                    const store = new Store(deserialized.data);
                    expect(store.size).to.be.greaterThan(10);
                    done();
                }).catch(done);
        });

        it('should resolve using a custom fetch', (done) => {
            BLESemBeaconBuilder.create()
                .namespaceId(BLEUUID.fromString('77f340db-ac0d-20e8-aa3a-f656a29f236c'))
                .instanceId('c187d748')
                .calibratedRSSI(-56)
                .shortResourceUri('https://bit.ly/3JsEnF9')
                .build().then(beacon => {
                    return service.resolve(beacon, { 
                        resolveAll: true,
                        fetch: (url: string, init: RequestInit) => {
                            console.log('Custom fetch', url);
                            return fetch(url, {
                                headers: {
                                    'User-Agent': 'SemBeacon Test'
                                },
                                ...init
                            });
                        }
                    });
                }).then(result => {
                    const serialized = DataSerializer.serialize(result);
                    const deserialized: ResolveResult = DataSerializer.deserialize(serialized);
                    expect(deserialized.data).to.not.be.undefined;
                    const store = new Store(deserialized.data);
                    expect(store.size).to.be.greaterThan(10);
                    done();
                }).catch(done);
        });
    });

    it('should initialize without a service', () => {

    });
});
