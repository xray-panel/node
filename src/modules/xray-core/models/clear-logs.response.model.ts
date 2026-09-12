export class ClearLogsResponseModel {
    public directory: string;
    public rotated: boolean;
    public removedArchives: number;
    public bytesFreed: number;
    public truncatedCurrent: boolean;

    constructor(
        directory: string,
        rotated: boolean,
        removedArchives: number,
        bytesFreed: number,
        truncatedCurrent: boolean,
    ) {
        this.directory = directory;
        this.rotated = rotated;
        this.removedArchives = removedArchives;
        this.bytesFreed = bytesFreed;
        this.truncatedCurrent = truncatedCurrent;
    }
}
