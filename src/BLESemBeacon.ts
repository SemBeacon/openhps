import 'reflect-metadata';
import { NumberType, SerializableMember, SerializableObject } from '@openhps/core';
import { DataFactory, IriString, Store, Thing, UrlString, rdfs, xsd } from '@openhps/rdf';
import { BLEBeaconObject, BLEEddystoneURL, BLEService, BLEUUID, BufferUtils } from '@openhps/rf';
import { sembeacon } from './terms';

/**
 * SemBeacon Flags
 */
export const SEMBEACON_FLAG_HAS_POSITION = 0x01 << 0;
export const SEMBEACON_FLAG_PRIVATE = 0x01 << 1;
export const SEMBEACON_FLAG_MOVING = 0x01 << 2;
export const SEMBEACON_FLAG_HAS_SYSTEM = 0x01 << 3;
export const SEMBEACON_FLAG_HAS_TELEMETRY = 0x01 << 4;
export const SEMBEACON_FLAG_RESERVED_1 = 0x01 << 5;
export const SEMBEACON_FLAG_RESERVED_2 = 0x01 << 6;
export const SEMBEACON_FLAG_RESERVED_3 = 0x01 << 7;
export const SEMBEACON_FLAG_UNDEFINED = 0x00;

/**
 * SemBeacon BLE Object
 */
@SerializableObject({
    rdf: {
        type: sembeacon.SemBeacon,
        deserializer: (thing) => {
            const beacon = new BLESemBeacon();
            beacon.resourceUri = thing.value as IriString;
            return beacon;
        },
    },
})
export class BLESemBeacon extends BLEBeaconObject {
    static readonly FLAGS = {
        SEMBEACON_FLAG_HAS_POSITION,
        SEMBEACON_FLAG_HAS_SYSTEM,
        SEMBEACON_FLAG_HAS_TELEMETRY,
        SEMBEACON_FLAG_MOVING,
        SEMBEACON_FLAG_PRIVATE,
    };
    static readonly PREFIXES = [...BLEEddystoneURL.PREFIXES];
    static readonly SUFFIXES = [...BLEEddystoneURL.SUFFIXES];
    @SerializableMember()
    flags: number;

    @SerializableMember({
        rdf: {
            predicate: [rdfs.seeAlso],
        },
    })
    object?: any;

    @SerializableMember({
        rdf: {
            predicate: sembeacon.namespaceId,
            datatype: xsd.hexBinary,
            serializer: (value: BLEUUID) => {
                if (!value) {
                    return undefined;
                }
                return DataFactory.literal(value.toString().replace(/-/g, ''), DataFactory.namedNode(xsd.hexBinary));
            },
            deserializer: (thing: Thing) => {
                if (!thing) {
                    return undefined;
                }
                return BLEUUID.fromString(thing.value);
            },
        },
    })
    namespaceId: BLEUUID;

    @SerializableMember({
        rdf: {
            predicate: sembeacon.instanceId,
            datatype: xsd.hexBinary,
            serializer: (value: BLEUUID) => {
                if (!value) {
                    return undefined;
                }
                return DataFactory.literal(value.toString().replace(/-/g, ''), DataFactory.namedNode(xsd.hexBinary));
            },
            deserializer: (thing: Thing) => {
                if (!thing) {
                    return undefined;
                }
                return BLEUUID.fromString(thing.value);
            },
        },
    })
    instanceId: BLEUUID;

    @SerializableMember({
        constructor: String,
    })
    resourceUri: UrlString;

    @SerializableMember({
        constructor: String,
        rdf: {
            predicate: sembeacon.shortResourceURI,
            datatype: xsd.anyURI,
        },
    })
    shortResourceUri: UrlString;

    // Transient
    resourceData: Store;

    /**
     * Modified timestamp
     */
    @SerializableMember({
        index: true,
        numberType: NumberType.LONG,
    })
    modifiedTimestamp = -1;

    /**
     * Max age
     */
    @SerializableMember({
        numberType: NumberType.LONG,
    })
    maxAge?: number;

    isValid(): boolean {
        return (
            (this.resourceUri !== undefined || this.shortResourceUri !== undefined) &&
            this.instanceId !== undefined &&
            this.namespaceId !== undefined
        );
    }

    parseManufacturerData(_: number, manufacturerData: Uint8Array): this {
        super.parseManufacturerData(_, manufacturerData);
        const view = new DataView(manufacturerData.buffer, 0);
        if (
            manufacturerData.byteLength < 24 ||
            !BufferUtils.arrayBuffersAreEqual(manufacturerData.buffer.slice(0, 2), Uint8Array.from([0xbe, 0xac]).buffer)
        ) {
            return this;
        }
        this.namespaceId = BLEUUID.fromBuffer(manufacturerData.slice(2, 18));
        this.instanceId = BLEUUID.fromBuffer(manufacturerData.slice(18, 22));
        this.calibratedRSSI = view.getInt8(22);
        this.flags = view.getUint8(23);
        if (this.uid === undefined) {
            this.uid = this.computeUID();
        }
        return this;
    }

    parseServiceData(uuid: BLEUUID, serviceData: Uint8Array): this {
        super.parseServiceData(uuid, serviceData);
        if (uuid === undefined && serviceData === undefined) {
            return this;
        }

        if (!this.service) {
            return this;
        }

        const urlData = new Uint8Array(serviceData.slice(2, serviceData.byteLength));
        const view = new DataView(urlData.buffer, 0);
        if (view.byteLength === 0) {
            return this;
        }

        const prefix = view.getUint8(0);
        if (prefix > BLESemBeacon.PREFIXES.length) {
            return this;
        }

        let url = BLESemBeacon.PREFIXES[prefix];
        for (let i = 1; i < view.byteLength; i++) {
            url +=
                view.getUint8(i) < BLESemBeacon.SUFFIXES.length
                    ? BLESemBeacon.SUFFIXES[view.getUint8(i)]
                    : String.fromCharCode(view.getUint8(i));
        }
        this.shortResourceUri = url as IriString;
        return this;
    }

    computeUID(): string {
        return BufferUtils.toHexString(
            BufferUtils.concatBuffer(this.namespaceId.toBuffer(), this.instanceId.toBuffer()),
        );
    }

    /**
     * Check if a SemBeacon flag is set
     * @param {number} flag Flag
     * @returns {boolean} Result
     */
    hasFlag(flag: number): boolean {
        return (this.flags & flag) !== 0;
    }

    /**
     * Set a SemBeacon flag
     * @param {number} flag Flag
     * @returns {this} SemBeacon instance
     */
    setFlag(flag: number): this {
        this.flags = this.flags | flag;
        return this;
    }

    removeFlag(flag: number): this {
        this.flags = this.flags ^ flag;
        return this;
    }

    /**
     * Get the manufacturer identifier
     * @returns {number} Manufacturer identifier
     */
    get manufacturerId(): number {
        return this.manufacturerData.size > 0 ? this.manufacturerData.keys().next().value : 0xffff;
    }

    /**
     * Set the manufacturer identifier
     * @param {number} value Manufacturer identifier
     */
    set manufacturerId(value: number) {
        // Get the current identifier
        const currentId = this.manufacturerId;
        // Get the current manufacturer data
        const currentData = this.manufacturerData.get(currentId);
        // Remove the current manufacturer
        this.manufacturerData.delete(currentId);
        // Set the new manufacturer
        this.manufacturerData.set(value, currentData);
    }

    protected get service(): BLEService {
        return this.getServiceByUUID(BLEUUID.fromString('FEAA'));
    }
}
