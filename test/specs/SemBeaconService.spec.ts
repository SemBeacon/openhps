import 'mocha';
import { expect } from 'chai';
import { SemBeaconService, BLESemBeaconBuilder, BLESemBeacon } from '../../src/';
import { MemoryDataService } from '@openhps/core';
import { BLEUUID } from '@openhps/rf';

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
    });

    it('should initialize without a service', () => {

    });
});
