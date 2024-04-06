import 'mocha';
import { expect } from 'chai';

import { BLESemBeaconBuilder } from '../../src/BLESemBeaconBuilder';

describe('BLESemBeaconBuilder', () => {
  it('should generate a deterministic namespace ID from the resource URI', (done) => {
    Promise.all([ BLESemBeaconBuilder.create()
      .instanceId('c187d748')
      .calibratedRSSI(-56)
      .resourceUri('https://bit.ly/3JsEnF9')
      .build(),
      BLESemBeaconBuilder.create()
      .instanceId('c187d748')
      .calibratedRSSI(-56)
      .resourceUri('https://bit.ly/3JsEnF9')
      .build()]).then(beacons => {
        expect(beacons[0].namespaceId.toString()).to.eq(beacons[1].namespaceId.toString());
        done();
      }).catch(done);
  });
});
