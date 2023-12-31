import 'mocha';
import { expect } from 'chai';
import { SemBeaconService, BLESemBeaconBuilder, BLESemBeacon, ResolveResult } from '../../src/';
import { DataSerializer, MemoryDataService } from '@openhps/core';
import { BLEUUID } from '@openhps/rf';
import { Store } from '@openhps/rdf';

describe('SemBeaconService', () => {
    let service: SemBeaconService;

    before((done) => {
        service = new SemBeaconService(new MemoryDataService(BLESemBeacon), {
            cors: true
        });
        service.emitAsync('build').then(() => done()).catch(done);
    });

    describe('resolve()', () => {
        it('should resolve all beacons', (done) => {
            BLESemBeaconBuilder.create()
                .namespaceId(BLEUUID.fromString('77f340db-ac0d-20e8-aa3a-f656a29f236c'))
                .instanceId('9c7ce6fc')
                .calibratedRSSI(-56)
                .shortResourceUri('https://bit.ly/3JsEnF9')
                .build().then(beacon => {
                    return service.resolve(beacon, { resolveAll: true });
                }).then(result => {
                    expect(result.result).to.not.be.undefined;
                    expect(result.beacons.length).to.eq(10);
                    done();
                }).catch(done);
        });

        it('should return serializable quads', (done) => {
            BLESemBeaconBuilder.create()
                .namespaceId(BLEUUID.fromString('77f340db-ac0d-20e8-aa3a-f656a29f236c'))
                .instanceId('9c7ce6fc')
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
    });

    it('should initialize without a service', () => {

    });
});
