/** A device as `devicectl list devices` lists it, the fields read here. */
export interface ListedDevice {
    connectionProperties: { transportType: string };
    deviceProperties: { name: string };
    hardwareProperties: { deviceType: string; reality: string; udid: string };
}

const TYPES = ["iPhone", "iPad"];

/**
 * The device on the cable of the type `IOS_DEVICE` names, an iPhone unless it
 * names an iPad: `test:ipados` sets it, so both can stay plugged in (D-168).
 */
export function deviceToDrive(devices: ListedDevice[], env: NodeJS.ProcessEnv): ListedDevice {
    const type = typeToDrive(env);
    if (!TYPES.includes(type)) throw new Error(`IOS_DEVICE must be iPhone or iPad, not ${type}`);
    const found = devices.find(
        (d) =>
            d.connectionProperties.transportType === "wired" &&
            d.hardwareProperties.reality === "physical" &&
            d.hardwareProperties.deviceType === type
    );
    if (!found) throw new Error(`No ${type} on USB.`);
    return found;
}

/** Whether this run drives an iPad, for a spec that holds only on a phone. */
export function drivesIPad(env: NodeJS.ProcessEnv): boolean {
    return typeToDrive(env) === "iPad";
}

function typeToDrive(env: NodeJS.ProcessEnv): string {
    return env.IOS_DEVICE ?? "iPhone";
}
