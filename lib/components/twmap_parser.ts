"use strict";

import { inflateSync } from "zlib";

export enum TileId {
	AIR = 0,
	SOLID = 1,
	DEATH = 2,
	NOHOOK = 3,
	NOLASER = 4,
	THROUGH_CUT = 5,
	THROUGH = 6,
	JUMP = 7,
	FREEZE = 9,
	TELEINEVIL = 10,
	UNFREEZE = 11,
	DFREEZE = 12,
	DUNFREEZE = 13,
	TELEINWEAPON = 14,
	TELEINHOOK = 15,
	WALLJUMP = 16,
	EHOOK_ENABLE = 17,
	EHOOK_DISABLE = 18,
	HIT_ENABLE = 19,
	HIT_DISABLE = 20,
	SOLO_ENABLE = 21,
	SOLO_DISABLE = 22,
}

export enum TileFlags {
	FLIP_X = 1,
	FLIP_Y = 2,
	OPAQUE = 4,
	ROTATE = 8,
}

export enum TilemapLayerType {
	TILES = 0,
	GAME = 1,
	TELE = 2,
	SPEEDUP = 4,
	FRONT = 8,
	SWITCH = 16,
	TUNE = 32,
}

export interface Tile {
	id: number;
	flags: number;
}

export interface TeleTile {
	number: number;
	id: number;
}

export interface SpeedupTile {
	force: number;
	max_speed: number;
	id: number;
	angle: number;
}

export interface SwitchTile {
	number: number;
	id: number;
	flags: number;
	delay: number;
}

export interface TuneTile {
	number: number;
	id: number;
}

export interface TileLayer {
	width: number;
	height: number;
	layer_type: TilemapLayerType;
	name: string;
	detail: boolean;
	tiles?: Tile[][];
	tele_tiles?: TeleTile[][];
	speedup_tiles?: SpeedupTile[][];
	switch_tiles?: SwitchTile[][];
	tune_tiles?: TuneTile[][];
}

export interface LayerGroup {
	name: string;
	x_offset: number;
	y_offset: number;
	x_parallax: number;
	y_parallax: number;
	clipping: boolean;
	layers: TileLayer[];
}

export interface MapInfo {
	datafile_version: number;
	groups: LayerGroup[];
	game_layer?: TileLayer;
	front_layer?: TileLayer;
	tele_layer?: TileLayer;
}

interface ItemTypeEntry {
	type_id: number;
	start: number;
	num: number;
}

interface RawItem {
	type_id: number;
	id: number;
	item_data: number[];
}

interface ParsedDatafile {
	version: number;
	items: Map<number, RawItem[]>;
	data_items: Buffer[];
}

const ITEM_TYPE_GROUPS = 4;
const ITEM_TYPE_LAYERS = 5;

export class TwMapParser {
	static parse(buf: Buffer): MapInfo {
		return this.parse_map(this.parse_datafile(buf));
	}

	static get_tile(map: MapInfo, x: number, y: number): Tile | undefined {
		return map.game_layer?.tiles?.[y]?.[x];
	}

	static is_solid(tile?: Tile) { return tile?.id === TileId.SOLID; }
	static is_nohook(tile?: Tile) { return tile?.id === TileId.NOHOOK || tile?.id === TileId.THROUGH_CUT; }
	static is_freeze(tile?: Tile) { return tile?.id === TileId.FREEZE; }
	static is_dfreeze(tile?: Tile) { return tile?.id === TileId.DFREEZE; }
	static is_hookthrough(tile?: Tile) { return tile?.id === TileId.THROUGH || tile?.id === TileId.THROUGH_CUT; }
	static is_death(tile?: Tile) { return tile?.id === TileId.DEATH; }
	static is_air(tile?: Tile) { return !tile || tile.id === TileId.AIR; }

	static tile_name(id: number): string {
		return TILE_NAMES[id] ?? `unknown(${id})`;
	}

	private static parse_datafile(buf: Buffer): ParsedDatafile {
		let pos = 0;
		const r32 = () => { const v = buf.readInt32LE(pos); pos += 4; return v; };

		const magic = buf.slice(0, 4).toString("ascii");
		if (magic !== "DATA" && magic !== "ATAD") throw new Error(`Invalid map magic: "${magic}"`);

		pos += 4;

		const version = r32();
		if (version !== 3 && version !== 4) throw new Error(`Unsupported datafile version: ${version}`);

		r32();
		r32();

		const num_item_types = r32();
		const num_items = r32();
		const num_data = r32();
		const item_block_size = r32();
		const data_block_size = r32();

		const item_types: ItemTypeEntry[] = [];
		for (let i = 0; i < num_item_types; i++) {
			item_types.push({ type_id: r32(), start: r32(), num: r32() });
		}

		const item_offsets: number[] = [];
		for (let i = 0; i < num_items; i++) item_offsets.push(r32());

		const data_offsets: number[] = [];
		for (let i = 0; i < num_data; i++) data_offsets.push(r32());

		if (version === 4) {
			for (let i = 0; i < num_data; i++) r32();
		}

		const items_start = pos;
		const items_by_type = new Map<number, RawItem[]>();

		for (const it of item_types) {
			const arr: RawItem[] = [];

			for (let i = 0; i < it.num; i++) {
				const off = items_start + item_offsets[it.start + i];
				const id = buf.readUInt16LE(off);
				const type_id = buf.readUInt16LE(off + 2);
				const size = buf.readInt32LE(off + 4);

				const item_data: number[] = [];
				for (let j = 0; j < size / 4; j++) {
					item_data.push(buf.readInt32LE(off + 8 + j * 4));
				}

				arr.push({ type_id, id, item_data });
			}

			items_by_type.set(it.type_id, arr);
		}

		const data_start = items_start + item_block_size;
		const raw_data = buf.slice(data_start, data_start + data_block_size);

		const data_items: Buffer[] = [];

		for (let i = 0; i < num_data; i++) {
			const off = data_offsets[i];
			const next_off = i + 1 < num_data ? data_offsets[i + 1] : data_block_size;
			const chunk = raw_data.slice(off, next_off);

			try { data_items.push(inflateSync(chunk)); } catch { data_items.push(chunk); }
		}

		return { version, items: items_by_type, data_items };
	}

	private static parse_map(df: ParsedDatafile): MapInfo {
		const result: MapInfo = {
			datafile_version: df.version,
			groups: [],
		};

		const group_items = df.items.get(ITEM_TYPE_GROUPS) ?? [];
		const layer_items = df.items.get(ITEM_TYPE_LAYERS) ?? [];

		for (const group_item of group_items) {
			const d = group_item.item_data;

			if (d.length < 7) continue;

			const group_version = d[0];
			const start_layer = d[5];
			const num_layers = d[6];

			const clipping = group_version >= 2 && d.length >= 8 ? d[7] !== 0 : false;

			const name = group_version >= 3 && d.length >= 15
				? this.decode_i32_string([d[12], d[13], d[14]])
				: "";

			const group: LayerGroup = {
				name,
				x_offset: d[1],
				y_offset: d[2],
				x_parallax: d[3],
				y_parallax: d[4],
				clipping,
				layers: [],
			};

			for (let li = start_layer; li < start_layer + num_layers; li++) {
				const layer_item = layer_items[li];
				if (!layer_item) continue;

				const ld = layer_item.item_data;

				if (ld.length < 7 || ld[1] !== 2) continue;

				const layer_type = ld[6] as TilemapLayerType;
				if (![0, 1, 2, 4, 8, 16, 32].includes(layer_type)) continue;

				const tilemap_version = ld[3];
				const width = ld[4];
				const height = ld[5];
				const detail = (ld[2] & 1) !== 0;

				const layer_name = tilemap_version >= 3 && ld.length >= 18
					? this.decode_i32_string([ld[15], ld[16], ld[17]])
					: "";

				const data_idx = this.get_data_index(layer_type, tilemap_version);
				if (ld.length <= data_idx) continue;

				const raw_idx = ld[data_idx];
				if (raw_idx < 0 || raw_idx >= df.data_items.length) continue;

				const raw_buf = df.data_items[raw_idx];
				if (!raw_buf) continue;

				const compressed = (layer_type === TilemapLayerType.GAME || layer_type === TilemapLayerType.TILES) && tilemap_version >= 4;

				const tile_layer: TileLayer = {
					width,
					height,
					layer_type,
					name: layer_name,
					detail,
				};

				switch (layer_type) {
					case TilemapLayerType.GAME:
					case TilemapLayerType.FRONT:
					case TilemapLayerType.TILES:
						tile_layer.tiles = this.parse_tiles(raw_buf, width, height, compressed);
						break;

					case TilemapLayerType.TELE:
						tile_layer.tele_tiles = this.parse_tele_tiles(raw_buf, width, height);
						break;

					case TilemapLayerType.SPEEDUP:
						tile_layer.speedup_tiles = this.parse_speedup_tiles(raw_buf, width, height);
						break;

					case TilemapLayerType.SWITCH:
						tile_layer.switch_tiles = this.parse_switch_tiles(raw_buf, width, height);
						break;

					case TilemapLayerType.TUNE:
						tile_layer.tune_tiles = this.parse_tune_tiles(raw_buf, width, height);
						break;
				}

				group.layers.push(tile_layer);

				if (layer_type === TilemapLayerType.GAME && !result.game_layer) result.game_layer = tile_layer;
				if (layer_type === TilemapLayerType.FRONT && !result.front_layer) result.front_layer = tile_layer;
				if (layer_type === TilemapLayerType.TELE && !result.tele_layer) result.tele_layer = tile_layer;
			}

			result.groups.push(group);
		}

		return result;
	}

	private static parse_tiles(buf: Buffer, width: number, height: number, compressed: boolean): Tile[][] {
		const total = width * height;
		const flat: Tile[] = [];

		if (compressed) {
			let p = 0;

			while (flat.length < total && p + 4 <= buf.length) {
				const id = buf.readUInt8(p);
				const flags = buf.readUInt8(p + 1);
				const skip = buf.readUInt8(p + 2);

				p += 4;

				for (let s = 0; s <= skip && flat.length < total; s++) {
				flat.push({ id, flags });
				}
			}
		} else {
			for (let i = 0; i + 4 <= buf.length && flat.length < total; i += 4) {
				flat.push({
				id: buf.readUInt8(i),
				flags: buf.readUInt8(i + 1),
				});
			}
		}

		return this.flat_to_2d(flat, width, height);
	}

	private static parse_tele_tiles(buf: Buffer, width: number, height: number): TeleTile[][] {
		const flat: TeleTile[] = [];

		for (let i = 0; i + 2 <= buf.length && flat.length < width * height; i += 2) {
			flat.push({
				number: buf.readUInt8(i),
				id: buf.readUInt8(i + 1),
			});
		}

		return this.flat_to_2d(flat, width, height);
	}

	private static parse_speedup_tiles(buf: Buffer, width: number, height: number): SpeedupTile[][] {
		const total = width * height;
		const byte_per = total > 0 ? Math.floor(buf.length / total) : 6;

		let src = buf;
		if (byte_per === 4 && total > 0) {
			const upgraded = Buffer.alloc(total * 6, 0);
			for (let n = 0; n < total; n++) {
				upgraded[n * 6 + 0] = buf[n * 4 + 0];
				upgraded[n * 6 + 2] = 28;
				upgraded[n * 6 + 4] = buf[n * 4 + 2];
				upgraded[n * 6 + 5] = buf[n * 4 + 3];
			}
			src = upgraded;
		}

		const actual_bpt = byte_per === 4 ? 6 : byte_per;
		const flat: SpeedupTile[] = [];

		for (let n = 0; n < total; n++) {
			const i = n * actual_bpt;
			flat.push({
				force:     src.readUInt8(i),
				max_speed: actual_bpt >= 2 ? src.readUInt8(i + 1) : 0,
				id:        actual_bpt >= 3 ? src.readUInt8(i + 2) : 0,
				angle:     actual_bpt >= 6 ? src.readInt16LE(i + 4) : 0,
			});
		}

		return this.flat_to_2d(flat, width, height);
	}

	private static parse_switch_tiles(buf: Buffer, width: number, height: number): SwitchTile[][] {
		const total = width * height;
		const byte_per = total > 0 ? Math.floor(buf.length / total) : 4;

		let src = buf;
		if ((byte_per === 2 || byte_per === 3) && total > 0) {
			const upgraded = Buffer.alloc(total * 4, 0);
			for (let n = 0; n < total; n++) {
				upgraded[n * 4 + 0] = buf[n * byte_per + 0];
				upgraded[n * 4 + 1] = buf[n * byte_per + 1];
				if (byte_per === 3) {
					upgraded[n * 4 + 2] = buf[n * byte_per + 2];
				}
			}
			src = upgraded;
		}

		const actual_bpt = (byte_per === 2 || byte_per === 3) ? 4 : byte_per;
		const flat: SwitchTile[] = [];

		for (let n = 0; n < total; n++) {
			const i = n * actual_bpt;
			flat.push({
				number: src.readUInt8(i),
				id:     actual_bpt >= 2 ? src.readUInt8(i + 1) : 0,
				flags:  actual_bpt >= 3 ? src.readUInt8(i + 2) : 0,
				delay:  actual_bpt >= 4 ? src.readUInt8(i + 3) : 0,
			});
		}

		return this.flat_to_2d(flat, width, height);
	}

	private static parse_tune_tiles(buf: Buffer, width: number, height: number): TuneTile[][] {
		const flat: TuneTile[] = [];

		for (let i = 0; i + 2 <= buf.length && flat.length < width * height; i += 2) {
			flat.push({
				number: buf.readUInt8(i),
				id: buf.readUInt8(i + 1),
			});
		}

		return this.flat_to_2d(flat, width, height);
	}

	private static get_data_index(layer_type: TilemapLayerType, tilemap_version: number): number {
		let idx: number;

		switch (layer_type) {
			case TilemapLayerType.GAME:
			case TilemapLayerType.TILES: idx = 14; break;
			case TilemapLayerType.TELE: idx = 18; break;
			case TilemapLayerType.SPEEDUP: idx = 19; break;
			case TilemapLayerType.FRONT: idx = 20; break;
			case TilemapLayerType.SWITCH: idx = 21; break;
			case TilemapLayerType.TUNE: idx = 22; break;
			default: return 14;
		}

		if (tilemap_version < 3 && idx > 14) idx -= 3;

		return idx;
	}

	private static decode_i32_string(ints: number[]): string {
		const bytes: number[] = [];

		for (const v of ints) {
			bytes.push((v >>> 24) & 0xff);
			bytes.push((v >>> 16) & 0xff);
			bytes.push((v >>> 8) & 0xff);
			bytes.push(v & 0xff);
		}

		if (bytes.every(b => b === 0)) return "";

		bytes.pop();

		for (let i = 0; i < bytes.length; i++) {
			bytes[i] = (bytes[i] + 128) & 0xff;
		}

		while (bytes.length > 0 && bytes[bytes.length - 1] === 0) {
			bytes.pop();
		}

		return Buffer.from(bytes).toString("utf8");
	}

	private static flat_to_2d<T>(flat: T[], width: number, height: number): T[][] {
		const result: T[][] = [];

		for (let y = 0; y < height; y++) {
			result.push(flat.slice(y * width, y * width + width));
		}

		return result;
	}
}

const TILE_NAMES: Record<number, string> = {
	0: "air",
	1: "solid (hookable)",
	2: "death",
	3: "nohook",
	4: "nolaser",
	5: "through_cut (nohook + hookthrough)",
	6: "through (hookthrough)",
	7: "jump",
	9: "freeze",
	10: "tele_in_evil",
	11: "unfreeze",
	12: "deep_freeze",
	13: "deep_unfreeze",
	14: "tele_in_weapon",
	15: "tele_in_hook",
	16: "walljump",
	17: "ehook_enable",
	18: "ehook_disable",
	19: "hit_enable",
	20: "hit_disable",
	21: "solo_enable",
	22: "solo_disable",
};

export default TwMapParser;