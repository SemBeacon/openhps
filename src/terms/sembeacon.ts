type IriString = `${'http' | 'https'}://${string}`;
type Property = IriString;
type Class = IriString;
type Datatype = IriString;
type OwlClass = IriString;
type OwlObjectProperty = IriString;
type OwlDatatypeProperty = IriString;
type HydraResource = IriString;
type HydraClass = IriString;
type HydraLink = IriString;
type HydraTemplatedLink = IriString;
type HydraVariableRepresentation = IriString;
type OtherIndividual = IriString;

/**
 * SemBeacon
 *
 * SemBeacon is a semantic beacon that broadcasts an URI describing its position and references its deployment.
 *
 * http://purl.org/sembeacon/SemBeacon
 */
export const SemBeacon: OwlClass = 'http://purl.org/sembeacon/SemBeacon';

/**
 * namespace
 *
 * The namespace property directs to the deployment containing all sensors deployed in this namespace.
 *
 * http://purl.org/sembeacon/namespace
 */
export const namespace: OwlObjectProperty = 'http://purl.org/sembeacon/namespace';

/**
 * Instance ID
 *
 * An instance identifier is the 32-bit UUID that defines the instance of a SemBeacon within a namespace.
 *
 * http://purl.org/sembeacon/instanceId
 */
export const instanceId: OwlDatatypeProperty = 'http://purl.org/sembeacon/instanceId';

/**
 * Namespace ID
 *
 * A namespace identifier is the 128-bit UUID that defines the namespace of a SemBeacon.
 *
 * http://purl.org/sembeacon/namespaceId
 */
export const namespaceId: OwlDatatypeProperty = 'http://purl.org/sembeacon/namespaceId';

/**
 * Short resource URI
 *
 * Shortened resource URI. The resource URI should resolve to the full resource URI of the resource that this predicate is used in.
 *
 * http://purl.org/sembeacon/shortResourceURI
 */
export const shortResourceURI: OwlDatatypeProperty = 'http://purl.org/sembeacon/shortResourceURI';

/**
 * version
 *
 * SemBeacon version
 *
 * http://purl.org/sembeacon/version
 */
export const version: OwlDatatypeProperty = 'http://purl.org/sembeacon/version';

export const _BASE: IriString = 'http://purl.org/sembeacon/';
export const _PREFIX: string = 'sembeacon';
