export const version: string = __SDK_VERSION__

/** The major names the frame's build and the files' directory: `v<major>`. */
export const major: number = Number(version.split('.')[0])
