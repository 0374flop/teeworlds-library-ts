import { assert } from "console";
import { crc32 } from "zlib";
import { iMapDetails } from "../client";
import TwMapParser, { MapInfo } from "./twmap_parser";
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
    parsed_mapinfo: MapInfo | undefined;
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
    parseMap() {
        if (this.downloading == true)
            throw new Error("Need to finish map download before trying to parsing the map");
        this.parsed_mapinfo = TwMapParser.parse(this.mapBuffer);
    }

    // wrapper functions for twmapparser
    isSolid(x: number, y: number) {
        if (this.downloading || this.parsed_mapinfo == undefined)
            throw new Error("Need to finish map download before using is_solid");
        return TwMapParser.is_solid(this.getTile(x,y));
    }
    isNohook(x: number, y: number) {
        if (this.downloading || this.parsed_mapinfo == undefined)
            throw new Error("Need to finish map download before using is_nohook");
        return TwMapParser.is_nohook(this.getTile(x,y));
    }
    isFreeze(x: number, y: number) {
        if (this.downloading || this.parsed_mapinfo == undefined)
            throw new Error("Need to finish map download before using is_freeze");
        return TwMapParser.is_freeze(this.getTile(x,y));
    }
    isDfreeze(x: number, y: number) {
        if (this.downloading || this.parsed_mapinfo == undefined)
            throw new Error("Need to finish map download before using is_dfreeze");
        return TwMapParser.is_dfreeze(this.getTile(x,y));
    }
    isHookthrough(x: number, y: number) {
        if (this.downloading || this.parsed_mapinfo == undefined)
            throw new Error("Need to finish map download before using is_hookthrough");
        return TwMapParser.is_hookthrough(this.getTile(x,y));
    }
    isDeath(x: number, y: number) {
        if (this.downloading || this.parsed_mapinfo == undefined)
            throw new Error("Need to finish map download before using is_death");
        return TwMapParser.is_death(this.getTile(x,y));
    }
    isAir(x: number, y: number) {
        if (this.downloading || this.parsed_mapinfo == undefined)
            throw new Error("Need to finish map download before using is_air");
        return TwMapParser.is_air(this.getTile(x,y));
    }
    getTile(x: number, y: number) {
        if (this.downloading || this.parsed_mapinfo == undefined)
            throw new Error("Need to finish map download before using is_air");
        return TwMapParser.get_tile(this.parsed_mapinfo, x, y);
        
    }

}