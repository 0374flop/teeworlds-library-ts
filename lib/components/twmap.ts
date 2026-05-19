import { assert } from "console";
import { crc32 } from "zlib";
import { iMapDetails } from "../client";
import { createHash } from "crypto";

export class TwMap {
    mapBuffer: Buffer;
    downloading: boolean = true;
    current_downloading_chunk: number = 0;
    map_name: string;
    crc: number;
    map_details: iMapDetails | undefined;
    // map_details: any;
    // map_crc: number;
    constructor(map_name: string, crc: number, size: number) {
        this.mapBuffer = Buffer.alloc(0);
        this.map_name = map_name;
        this.crc = crc;
    }
    appendChunk(chunk_index: number, chunk_data: Buffer) {
        // assert(chunk_index==this.current_downloading_chunk, chunk_index, this.current_downloading_chunk, chunk_size);
        if (chunk_index == this.current_downloading_chunk) {
            this.mapBuffer = Buffer.concat([this.mapBuffer, chunk_data]);
        }
        
    }
    calculateCrc() {
        let Crc = 0;
        let index = 0;
        const BUFFER_SIZE = 64*1024;

        while (index*BUFFER_SIZE<this.mapBuffer.byteLength) {
            Crc = crc32(
                this.mapBuffer.subarray(index*BUFFER_SIZE, (index+1)*BUFFER_SIZE), 
                Crc); // calc crc in 64KiB steps just like tw does it 
            index++;
        }   
        return Crc & 0xffffffff;
    }
    
    calculateSha256() { // kinda unnecessary since we already have crc?
        const sha256 = createHash("sha256");
        let index = 0;
        const BUFFER_SIZE = 64*1024;

        while (index*BUFFER_SIZE<this.mapBuffer.byteLength) {
            sha256.update(this.mapBuffer.subarray(index*BUFFER_SIZE, (index+1)*BUFFER_SIZE));
            // calc sha256 in 64KiB steps just like tw does it 
            index++;
        }   
        return sha256;
    }

}