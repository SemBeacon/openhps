import 'mocha';
import { expect } from 'chai';

import { BLESemBeacon } from '../../src/BLESemBeacon';
import { RDFSerializer } from '@openhps/rdf';
import { BLEUUID } from '@openhps/rf';

describe('BLESemBeacon', () => {
  describe('construction', () => {
    // const manufacturerData = new Uint8Array([
    //     190, 172, 253, 165, 6, 147, 164, 226, 79, 177, 175, 207, 198, 235, 7, 100, 120, 37, 139, 29, 11, 60, 200, 0,
    //     22, 22,
    // ]);

    const payload = new Uint8Array([
      2, 1, 6, 27, 255, 76, 0, 190, 172, 253, 165, 6, 147, 164, 226, 79, 177, 175, 207, 198, 235, 7, 100, 120, 37, 139,
      29, 11, 60, 200, 0, 22, 22, 170, 254, 16, 241, 3, 116, 105, 110, 121, 117, 114, 108, 0, 53, 55, 109, 98, 98, 120,
      50, 119, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);

    it('should parse a raw payload', () => {
      const beacon = new BLESemBeacon();
      beacon.parseAdvertisement(payload);
      expect(beacon.isValid()).to.be.true;
    });
  });

  describe('serialization', () => {
    it('should serialize to RDF', () => {
      const object = new BLESemBeacon(undefined);
      object.namespaceId = BLEUUID.fromString('AAFE');
      object.instanceId = BLEUUID.fromString('1234');
      object.resourceUri = 'http://test.com';
      const serialized = RDFSerializer.serialize(object);
      expect(serialized).to.not.be.undefined;
    });
  });

  describe('flags', () => {
    it('should set and get flags', () => {
      const beacon = new BLESemBeacon();
      beacon.flags = 9;
    });
  });
});
