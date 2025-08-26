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
import { BLEBeaconObject, BLEUUID } from '@openhps/rf';
import fetch, { Headers } from 'cross-fetch';
import { RdfXmlParser } from 'rdfxml-streaming-parser';
import { sembeacon } from './terms';

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

    get fetch(): typeof _fetch {
        return this.options.fetch;
    }

    set fetch(value: typeof _fetch) {
        this.options.fetch = value;
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
     * @param {BLESemBeacon} [existingObject] Existing SemBeacon object
     * @returns {Promise<BLESemBeacon>} Promise of resolved SemBeacon
     */
    resolve(
        object: BLESemBeacon,
        options: ResolveOptions = {
            persistence: false,
            resolveAll: false,
        },
        existingObject?: BLESemBeacon,
    ): Promise<ResolveResult> {
        return new Promise((resolve, reject) => {
            let resourceData: Store = undefined;
            Promise.all([
                !object.shortResourceUri && object.resourceUri ? this.shortenURL(object) : Promise.resolve(object),
                options.persistence && existingObject === undefined
                    ? (this._findByUID(object.uid) as Promise<BLESemBeacon>)
                    : Promise.resolve(existingObject),
            ])
                .then((objects: BLESemBeacon[]) => {
                    if (
                        (objects[1] === undefined ||
                            TimeService.now() - objects[1].maxAge > objects[1].modifiedTimestamp) &&
                        (objects[0].resourceUri !== undefined || objects[0].shortResourceUri !== undefined) &&
                        !this.queue.has(objects[0].uid)
                    ) {
                        return this.fetchData(objects[0], {
                            fetch: options.fetch,
                        });
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
                // Get the existing SemBeacon if found
                // To retrieve caching information
                this._findByUID(uid)
                    .then((existingObject: BLESemBeacon) => {
                        // Before resolving the SemBeacon, check the cache
                        if (
                            !existingObject ||
                            TimeService.now() - existingObject.maxAge > existingObject.modifiedTimestamp
                        ) {
                            return this.resolve(
                                object,
                                {
                                    resolveAll: true,
                                    persistence: false,
                                    fetch: this.options.fetch,
                                },
                                existingObject as BLESemBeacon,
                            );
                        } else {
                            return Promise.resolve({
                                result: existingObject,
                                beacons: [],
                                data: undefined,
                            } as ResolveResult);
                        }
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

    protected fetchData(
        beacon: BLESemBeacon,
        options: FetchOptions = {},
    ): Promise<{ beacon: BLESemBeacon; store: Store }> {
        return new Promise((resolve, reject) => {
            if (this.queue.has(beacon.uid)) {
                return resolve({ beacon, store: undefined });
            }
            this.queue.add(beacon.uid);
            const fetcher = options.fetch ?? fetch;

            // Headers
            const headers = new Headers();
            headers.set('Accept', 'text/turtle;q=1.0,text/n3;q=0.9,application/rdf+xml;q=0.8');
            headers.set('User-Agent', 'SemBeacon/1.0');
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.options.timeout ?? 5000);
            fetcher(this.normalizeURI(beacon), {
                method: 'GET',
                headers,
                signal: controller.signal,
            })
                .then(async (response) => {
                    clearTimeout(timeoutId);

                    const data: string = await response.text();
                    const cacheTimeout = this._parseCacheControl(response);
                    let resourceUri: IriString = (response.url as IriString) ?? beacon.resourceUri;
                    if (response.headers.has('x-final-url')) {
                        // Permanent URL fix
                        resourceUri = response.headers.get('x-final-url') as IriString;
                    }

                    const contentType = response.headers.get('content-type') ?? 'text/turtle';

                    this.logger('debug', `Fetched SemBeacon data from ${resourceUri}`);
                    let deserialized: any;
                    try {
                        deserialized = RDFSerializer.deserializeFromString(resourceUri, data, contentType);
                    } catch (ex) {
                        // Unable to deserialize
                        this.logger(
                            'error',
                            `Unable to deserialize SemBeacon data from ${resourceUri}: ${ex.message}`,
                            data as any,
                        );
                        resolve({ beacon, store: undefined });
                        return;
                    }
                    if (deserialized === undefined) {
                        this.logger('error', `Unable to deserialize SemBeacon data from ${resourceUri}!`, data as any);
                        resolve({ beacon, store: undefined });
                        return;
                    }

                    let quads: Quad[] = [];
                    if (contentType.includes('application/rdf+xml') || data.startsWith('<?xml version=')) {
                        const parser = new RdfXmlParser({
                            baseIRI: resourceUri,
                        });
                        parser.on('data', (data: Quad) => {
                            quads.push(data);
                        });
                        parser.on('error', (err) => {
                            throw new Error('An error occured during RDF parsing: ' + err);
                        });
                        parser.write(data);
                        parser.end();
                    } else {
                        const mimetype = contentType.substring(0, contentType.indexOf(';'));
                        const parser = new Parser({
                            format: mimetype,
                        });
                        quads = parser.parse(data);
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
                        // If beacon does not have namespace/instance
                        if (!beacon.namespaceId || !beacon.instanceId) {
                            beacon.namespaceId = deserialized.namespaceId;
                            beacon.instanceId = deserialized.instanceId;
                            if (beacon.namespaceId === undefined && (deserialized as any)._namespace !== undefined) {
                                const quads = store.getQuads(
                                    DataFactory.namedNode((deserialized as any)._namespace),
                                    DataFactory.namedNode(sembeacon.namespaceId),
                                    undefined,
                                    undefined,
                                );
                                if (quads.length > 0) {
                                    beacon.namespaceId = BLEUUID.fromString(quads[0].object.value);
                                }
                            }
                            beacon.uid = beacon.computeUID();
                        }
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
                            deserialized = RDFSerializer.deserializeFromString(beacon.resourceUri, data);
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

    private _parseCacheControl(response: Response): number {
        const header = response.headers.get('Cache-Control') ?? response.headers.get('cache-control');
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
        if (this.options.minTimeout) {
            return Math.max(timeout, this.options.minTimeout);
        } else {
            return timeout;
        }
    }
}

export interface SemBeaconServiceOptions extends DataServiceOptions, FetchOptions {
    /**
     * Minimum cache timeout in milliseconds
     */
    minTimeout?: number;
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

export interface ResolveOptions extends FetchOptions {
    /**
     * Resolve all beacons in the same namespace
     */
    resolveAll?: boolean;
    /**
     * Persist resolved SemBeacon
     */
    persistence?: boolean;
}

interface FetchOptions {
    /**
     * Custom fetch function
     */
    fetch?: typeof _fetch;
}
