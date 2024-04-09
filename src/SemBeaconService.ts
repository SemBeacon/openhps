import { BLESemBeacon } from './BLESemBeacon';
import { DataObjectService, DataServiceDriver, DataServiceOptions, Model, TimeService } from '@openhps/core';
import {
    DataFactory,
    DefaultEngine,
    IriString,
    NamedNode,
    Parser,
    Quad,
    RDFSerializer,
    SPARQLDataDriver,
    Store,
} from '@openhps/rdf';
import { BLEBeaconObject } from '@openhps/rf';
import axios, { AxiosResponse } from 'axios';
import { RdfXmlParser } from 'rdfxml-streaming-parser';

export interface ResolveResult {
    result: BLESemBeacon;
    beacons?: BLEBeaconObject[];
    data: any[];
}

/**
 * SemBeacon data object service for persisting and retrieving SemBeacon data
 */
export class SemBeaconService extends DataObjectService<BLEBeaconObject> {
    protected options: SemBeaconServiceOptions;
    protected queue: Set<string> = new Set();

    /**
     * Create a new SemBeaconService. When no driver is provided, it will search for
     * an external BLEBeaconObject data service.
     * @param {DataServiceDriver | null} [driver] Data service driver to store SemBeacons
     * @param {SemBeaconServiceOptions} [options] service options
     */
    constructor(driver?: DataServiceDriver<string, BLEBeaconObject>, options?: SemBeaconServiceOptions) {
        super(driver);
        this.options = options ?? { cors: true };
        this.uid = options.uid ?? this.uid;
        this.once('build', this._onBuild.bind(this));
    }

    private get proxyURL(): IriString {
        return this.options.cors && typeof this.options.cors === 'string' ? this.options.cors : undefined;
    }

    private _onBuild(): Promise<void> {
        return new Promise((resolve) => {
            if (this.driver === null) {
                const service = (this.model as Model).findDataService(BLEBeaconObject);
                this.driver = (service as any).driver; // Experimental
            }
            resolve();
        });
    }

    protected _findByUID(uid: string): Promise<BLEBeaconObject> {
        return new Promise((resolve) => {
            this.findByUID(uid)
                .then((beacon) => resolve(beacon as BLEBeaconObject))
                .catch(() => {
                    resolve(undefined);
                });
        });
    }

    protected insertRapid(uid: string, object: BLEBeaconObject): Promise<BLEBeaconObject> {
        this.emitAsync('beacon', object);
        return super.insert(uid, object);
    }

    /**
     * Resolve SemBeacon information
     * @param {BLESemBeacon} object SemBeacon object
     * @param {ResolveOptions} [options] Resolve options
     * @returns {Promise<BLESemBeacon>} Promise of resolved SemBeacon
     */
    resolve(
        object: BLESemBeacon,
        options: ResolveOptions = {
            persistance: true,
            resolveAll: false,
        },
    ): Promise<ResolveResult> {
        return new Promise((resolve, reject) => {
            let resourceData: Store = undefined;
            Promise.all([
                !object.shortResourceUri && object.resourceUri ? this.shortenURL(object) : Promise.resolve(object),
                options.persistance
                    ? (this._findByUID(object.uid) as Promise<BLESemBeacon>)
                    : Promise.resolve(undefined),
            ])
                .then((objects: BLESemBeacon[]) => {
                    if (
                        (objects[1] === undefined ||
                            TimeService.now() - objects[1].maxAge > objects[1].modifiedTimestamp) &&
                        (objects[0].resourceUri !== undefined || objects[0].shortResourceUri !== undefined) &&
                        !this.queue.has(objects[0].uid)
                    ) {
                        return this.fetchData(objects[0]);
                    } else {
                        return Promise.resolve({
                            beacon: this._mergeBeacon(objects[0], objects[1]) as BLESemBeacon,
                            store: undefined,
                        });
                    }
                })
                .then((result: { beacon: BLESemBeacon; store: Store }) => {
                    resourceData = result.store;
                    if (options.resolveAll) {
                        return this.fetchAllBeacons(result.beacon, result.store);
                    } else {
                        return Promise.all([result.beacon]);
                    }
                })
                .then((objects) => {
                    const quads: any[] = !resourceData
                        ? undefined
                        : resourceData.getQuads(undefined, undefined, undefined, undefined).map((q) => q.toJSON());
                    if (objects.length === 1) {
                        resolve({ result: objects[0] as BLESemBeacon, data: quads });
                    } else {
                        resolve({ result: objects[0] as BLESemBeacon, beacons: objects.slice(1), data: quads });
                    }
                })
                .catch(reject);
        });
    }

    /**
     * Insert a new BLE beacon object
     * @param {string} uid Unique identifier
     * @param {BLEBeaconObject} object Beacon object
     * @returns {Promise<BLEBeaconObject>} Beacon promise
     */
    insert(uid: string, object: BLEBeaconObject): Promise<BLEBeaconObject> {
        return new Promise((resolve, reject) => {
            if (object instanceof BLESemBeacon) {
                this.resolve(object, {
                    resolveAll: true,
                })
                    .then((beacons) => {
                        if (!beacons.result) {
                            reject(
                                new Error(
                                    `Unable to resolve SemBeacon data! 
                                    ns=${object.namespaceId.toString()}, 
                                    id=${object.instanceId.toString(4, false)}, 
                                    uri=${object.resourceUri}, 
                                    shortURI=${object.shortResourceUri}`,
                                ),
                            );
                            return;
                        }
                        beacons.result.resourceData = new Store(beacons.data);
                        if (beacons.beacons) {
                            return Promise.all(
                                beacons.beacons.map((b) => {
                                    return this.insertRapid(b.uid, b);
                                }),
                            ).then(() => {
                                return Promise.resolve(beacons.result);
                            });
                        } else {
                            return Promise.resolve(beacons.result);
                        }
                    })
                    .then((beacon) => {
                        if (!beacon) {
                            return;
                        }
                        this.emitAsync('beacon', beacon);
                        return super.insert(uid, beacon);
                    })
                    .then(resolve)
                    .catch(reject);
            } else {
                this._findByUID(object.uid)
                    .then((beacon) => {
                        return super.insert(uid, this._mergeBeacon(object, beacon));
                    })
                    .then((beacon) => {
                        this.emitAsync('beacon', beacon);
                    })
                    .catch(reject);
            }
        });
    }

    protected fetchAllBeacons(beacon: BLESemBeacon, store: Store): Promise<BLEBeaconObject[]> {
        return new Promise((resolve, reject) => {
            if (beacon.namespaceId === undefined || store === undefined) {
                return resolve([]);
            }
            const driver = new SPARQLDataDriver(BLESemBeacon, {
                sources: [store],
                engine: DefaultEngine,
            });
            const namespaceIdSantized = beacon.namespaceId.toString().replaceAll('-', '');
            const query = `
                PREFIX sembeacon: <http://purl.org/sembeacon/>
                PREFIX poso: <http://purl.org/poso/>

                SELECT ?beacon {
                    ?beacon a poso:BluetoothBeacon .
                    { 
                        ?beacon sembeacon:namespaceId "${namespaceIdSantized}"^^xsd:hexBinary 
                    } 
                    UNION
                    { 
                        ?beacon sembeacon:namespace ?namespace .
                        ?namespace sembeacon:namespaceId "${namespaceIdSantized}"^^xsd:hexBinary .
                    } .
                }`;
            driver
                .queryBindings(query)
                .then((bindings) => {
                    const beacons: BLEBeaconObject[] = [beacon];
                    bindings.forEach((binding) => {
                        const beaconURI = (binding.get('beacon') as NamedNode).id;
                        const deserializedBeacon: BLEBeaconObject = RDFSerializer.deserializeFromStore(
                            DataFactory.namedNode(beaconURI),
                            store,
                        );
                        if (deserializedBeacon instanceof BLEBeaconObject) {
                            if (deserializedBeacon instanceof BLESemBeacon) {
                                deserializedBeacon.namespaceId = beacon.namespaceId;
                                if (deserializedBeacon.instanceId.toString() === beacon.instanceId.toString()) {
                                    return;
                                }
                                deserializedBeacon.modifiedTimestamp = TimeService.now();
                            }
                            deserializedBeacon.uid = deserializedBeacon.computeUID();
                            beacons.push(deserializedBeacon);
                        }
                    });
                    resolve(beacons);
                })
                .catch(reject);
        });
    }

    protected shortenURL(beacon: BLESemBeacon): Promise<BLESemBeacon> {
        return new Promise((resolve, reject) => {
            if (!this.options.urlShortener) {
                return resolve(beacon);
            }
            this.options
                .urlShortener(beacon.resourceUri)
                .then((shortened) => {
                    beacon.shortResourceUri = shortened as IriString;
                    resolve(beacon);
                })
                .catch(reject);
        });
    }

    protected normalizeURI(beacon: BLESemBeacon): IriString {
        const url = beacon.resourceUri ?? beacon.shortResourceUri;
        if (this.options.cors) {
            return `${this.proxyURL}${encodeURIComponent(url)}` as IriString;
        } else {
            return url;
        }
    }

    protected fetchData(beacon: BLESemBeacon): Promise<{ beacon: BLESemBeacon; store: Store }> {
        return new Promise((resolve, reject) => {
            if (this.queue.has(beacon.uid)) {
                return resolve({ beacon, store: undefined });
            }
            this.queue.add(beacon.uid);
            axios
                .get(this.normalizeURI(beacon), {
                    headers: {
                        Accept: 'text/turtle;q=1.0,text/n3;q=0.9,application/rdf+xml;q=0.8',
                    },
                    withCredentials: false,
                    timeout: this.options.timeout ?? 5000,
                })
                .then(async (result: AxiosResponse) => {
                    const cacheTimeout = this._parseCacheControl(result);
                    let resourceUri =
                        result.request.responseUrl ??
                        result.request.responseURL ??
                        (result.request.res ? result.request.res.responseUrl : beacon.resourceUri);
                    if (result.headers['x-final-url'] !== undefined) {
                        // Permanent URL fix
                        resourceUri = result.headers['x-final-url'];
                    }

                    const contentType = result.headers['content-type'] ?? 'text/turtle';

                    this.logger('debug', `Fetched SemBeacon data from ${resourceUri}`);
                    let deserialized: any;
                    try {
                        deserialized = RDFSerializer.deserializeFromString(resourceUri, result.data, contentType);
                    } catch (ex) {
                        // Unable to deserialize
                        this.logger(
                            'error',
                            `Unable to deserialize SemBeacon data from ${resourceUri}: ${ex.message}`,
                            result.data,
                        );
                        resolve({ beacon, store: undefined });
                        return;
                    }
                    if (deserialized === undefined) {
                        this.logger('error', `Unable to deserialize SemBeacon data from ${resourceUri}!`, result.data);
                        resolve({ beacon, store: undefined });
                        return;
                    }

                    let quads: Quad[] = [];
                    if (contentType.includes('application/rdf+xml') || result.data.startsWith('<?xml version=')) {
                        const parser = new RdfXmlParser({
                            baseIRI: resourceUri,
                        });
                        parser.on('data', (data: Quad) => {
                            quads.push(data);
                        });
                        parser.on('error', (err) => {
                            throw new Error('An error occured during RDF parsing: ' + err);
                        });
                        parser.write(result.data);
                        parser.end();
                    } else {
                        const mimetype = contentType.substring(0, contentType.indexOf(';'));
                        const parser = new Parser({
                            format: mimetype,
                        });
                        quads = parser.parse(result.data);
                    }
                    const store = new Store(quads);

                    // Check if the deserialized object is a sembeacon
                    if (deserialized instanceof BLESemBeacon) {
                        // SemBeacon
                        deserialized.resourceUri = resourceUri;
                        deserialized.shortResourceUri = beacon.shortResourceUri;
                        if (resourceUri !== beacon.resourceUri) {
                            beacon.resourceUri = resourceUri;
                        }
                        deserialized.createdTimestamp = beacon.createdTimestamp;
                        beacon = this._mergeBeacon(beacon, deserialized) as BLESemBeacon;
                        beacon.maxAge = cacheTimeout;
                        beacon.modifiedTimestamp = TimeService.now();
                        return Promise.resolve({ store, beacon });
                    } else if (deserialized instanceof BLEBeaconObject) {
                        // Query to find the SemBeacon
                        const driver = new SPARQLDataDriver(BLESemBeacon, {
                            sources: [store],
                            engine: DefaultEngine,
                        });
                        const namespaceIdSantized = beacon.namespaceId.toString().replaceAll('-', '');
                        const instanceIdSanitized = beacon.instanceId.toString(4, false).replaceAll('-', '');
                        const query = `
                        PREFIX sembeacon: <http://purl.org/sembeacon/>
                        SELECT ?beacon {
                            { 
                                ?beacon sembeacon:namespaceId "${namespaceIdSantized}"^^xsd:hexBinary 
                            } 
                            UNION
                            { 
                                ?beacon sembeacon:namespace ?namespace .
                                ?namespace sembeacon:namespaceId "${namespaceIdSantized}"^^xsd:hexBinary .
                            } .
                            ?beacon sembeacon:instanceId "${instanceIdSanitized}"^^xsd:hexBinary .
                        }`;
                        const bindings = await driver.queryBindings(query);
                        if (bindings.length > 0) {
                            const beaconURI = (bindings[0].get('beacon') as NamedNode).id;
                            beacon.resourceUri = beaconURI as IriString;
                            deserialized = RDFSerializer.deserializeFromString(beacon.resourceUri, result.data);
                            beacon = this._mergeBeacon(beacon, deserialized as BLEBeaconObject) as BLESemBeacon;
                            beacon.maxAge = cacheTimeout;
                            beacon.modifiedTimestamp = TimeService.now();
                        } else if (bindings.length === 0) {
                            this.logger(
                                'warn',
                                `Unable to find SemBeacon with namespaceId=${namespaceIdSantized} and instanceId=${instanceIdSanitized} in URI ${beacon.resourceUri}!`,
                            );
                        }
                        return Promise.resolve({ store, beacon });
                    } else {
                        // Deserialize object is not a SemBeacon or other beacon object
                        if (resourceUri !== beacon.resourceUri) {
                            beacon.resourceUri = resourceUri;
                        }
                        deserialized.createdTimestamp = beacon.createdTimestamp;
                        beacon.maxAge = cacheTimeout;
                        beacon.modifiedTimestamp = TimeService.now();
                        beacon.object = deserialized;
                        return Promise.resolve({ store, beacon });
                    }
                })
                .then((result: { beacon: BLESemBeacon; store: Store }) => {
                    resolve({ beacon: result.beacon, store: result.store });
                })
                .catch(reject)
                .finally(() => {
                    this.queue.delete(beacon.uid);
                });
        });
    }

    private _mergeBeacon(beacon: BLEBeaconObject, online: BLEBeaconObject): BLEBeaconObject {
        if (online === undefined || online.constructor.name !== beacon.constructor.name) {
            return beacon;
        }
        online.rawAdvertisement = beacon.rawAdvertisement;
        beacon.services.forEach((service) => {
            online.addService(service);
        });
        online.calibratedRSSI = beacon.calibratedRSSI;
        online.relativePositions = beacon.relativePositions;
        online.manufacturerData = beacon.manufacturerData;

        if (online instanceof BLESemBeacon && beacon instanceof BLESemBeacon) {
            online.namespaceId = beacon.namespaceId;
            online.instanceId = beacon.instanceId;
            online.flags = beacon.flags;
            if (online.shortResourceUri !== beacon.shortResourceUri) {
                online.shortResourceUri = beacon.shortResourceUri;
                online.resourceUri = beacon.resourceUri;
            }
        }
        online.uid = online.computeUID();
        return online;
    }

    private _parseCacheControl(response: AxiosResponse): number {
        const header = response.headers['Cache-Control'];
        if (!header) {
            return 30000; // Default cache timeout
        }
        const directives = header
            .toString()
            .toLowerCase()
            .split(',')
            .map((str) =>
                str
                    .trim()
                    .split('=')
                    .map((str) => str.trim()),
            );
        let timeout = 30000;
        for (const [directive, value] of directives) {
            switch (directive) {
                case 'max-age': {
                    const maxAge = parseInt(value, 10);
                    if (isNaN(maxAge)) continue;
                    timeout = maxAge;
                    break;
                }
                case 'no-store':
                case 'no-cache':
                    timeout = 0;
                    break;
            }
        }
        return timeout;
    }
}

export interface SemBeaconServiceOptions extends DataServiceOptions {
    /**
     * Enable CORS proxy
     * @type {boolean} Enable CORS proxy
     * @type {string} Custom CORS proxy URL
     */
    cors?: boolean | IriString;
    /**
     * URL shortener callback
     */
    urlShortener?: (url: string) => Promise<string>;
    uid?: string;
    /**
     * Timeout for fetching SemBeacon data
     * @default 5000
     */
    timeout?: number;
}

export interface ResolveOptions {
    resolveAll?: boolean;
    persistance?: boolean;
}
