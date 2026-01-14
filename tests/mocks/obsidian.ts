import moment from "moment";

export class TFile {
    basename: string;
    path: string;
    constructor(path: string) {
        this.path = path;
        // basename is filename without extension
        this.basename = path.split("/").pop()?.replace(/\.md$/, "") || "";
    }
}

export { moment };
