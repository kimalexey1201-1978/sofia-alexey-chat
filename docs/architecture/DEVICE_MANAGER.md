# Sofia AI — Universal Device Manager v0.1

Status: architecture specification; no physical-device integrations are implemented by this document.

## Responsibility boundary

Universal Device Manager (UDM) manages physical device instances and their connections. It is distinct from:
- Module Registry: installable software adapters.
- Capability Registry: validated operations available to Sofia.
- Security Manager: grants and enforces access.

A manufacturer adapter is a software module. A connected watch, headset, phone, camera, vehicle or display is a device instance.

## Device classes

Phones/tablets; computers; smart glasses and heads-up displays; headphones/earbuds; watches and fitness bands; cameras; TVs and displays; vehicles and infotainment systems; smart-home devices; future classes introduced through adapters.

Listing a class does not imply universal compatibility. Integration requires a supported protocol/API, compatible hardware and OS, permissions, and (where necessary) manufacturer approval or account authorization.

## Device record

Store an opaque local device ID, device class, manufacturer/model identifiers where available, adapter ID/version, supported protocol, advertised and verified capabilities, connection state, permission grants, pairing provenance, firmware/app compatibility, battery/resource telemetry where exposed, last-seen time and health status.

Do not use serial numbers, MAC addresses or other persistent hardware identifiers as user-facing IDs. Collect only what is needed.

## Connection lifecycle

`DISCOVERED → PAIRING_REQUIRED → AUTHORIZING → CONNECTED → DEGRADED / DISCONNECTED`

Additional states: `UNSUPPORTED`, `BLOCKED`, `REVOKED`, `ERROR`.

Discovery never authorizes access. Pairing and permission grants are explicit. Revoking a device invalidates its session credentials and prevents further capability calls.

## Capability negotiation

On connection, the adapter reports candidate capabilities. UDM checks the device/API version and permissions, then asks Capability Registry to validate and publish only supported operations. A device cannot self-assert access beyond what the OS or manufacturer API actually exposes.

Examples:
- Headset: audio output, microphone input, button events, battery status.
- Glasses: camera capture, audio, display overlay, gesture input—only if the model exposes them.
- Watch: notifications, health/activity data, microphone, controls—subject to OS and user permissions.
- Vehicle: media, navigation or telemetry only through supported manufacturer/OS interfaces.

## Safety and privacy

- Camera, microphone, location and health-related streams require explicit, purpose-specific permission.
- Show clear indicators while sensors are active and provide immediate stop/revoke controls.
- Avoid continuous background capture by default.
- Minimize raw sensor retention; encrypt stored device credentials.
- Do not treat device possession or Bluetooth pairing as proof of owner identity.
- Critical actions require owner authentication and confirmation independent of device connection.

## Reliability and resource management

Monitor connection quality, latency, battery and thermal/resource signals when exposed. Respect Android background execution limits and manufacturer restrictions. Support reconnect backoff, stale-session invalidation and graceful degradation. Do not keep a sensor stream alive merely because the app process exists.

## Adapter contract expectations

Each adapter declares:
- adapter/module ID and version;
- supported device classes, models, OS versions and protocols;
- discovery, pairing, authorization and disconnect behavior;
- capability mappings and schema versions;
- required permissions and data classes;
- supported events and polling limits;
- reconnect, timeout and cancellation behavior;
- security limitations and test evidence.

## Acceptance criteria

- A paired device is not automatically trusted for sensitive actions.
- Device records are separate from adapter modules.
- Unsupported devices fail closed with a clear explanation.
- Revocation stops future access.
- Sensor access is visible, scoped and stoppable.
- Android restrictions and manufacturer APIs are respected.
