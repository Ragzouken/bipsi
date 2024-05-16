const URL_PARAMS = new URLSearchParams(window.location.search);
const BIPSI_HD = URL_PARAMS.get("hd") === "true" || document.documentElement.dataset.hd;
let  SAVE_SLOT = URL_PARAMS.get("save") ?? "slot0";

// browser saves will be stored under the id "bipsi"
let storage = new maker.ProjectStorage(BIPSI_HD ? "bipsi-hd" : "bipsi");

// type definitions for the structure of bipsi project data. useful for the
// code editor, ignored by the browser 
/**
 * @typedef {Object} BipsiDataSettings
 * @property {string} title
 */

/**
 * @typedef {Object} BipsiDataEventField
 * @property {string} key
 * @property {string} type
 * @property {any} data
 */

/**
 * @typedef {Object} BipsiDataEvent
 * @property {number} id
 * @property {number[]} position
 * @property {BipsiDataEventField[]} fields
 */

/**
 * @typedef {Object} BipsiDataRoom
 * @property {number} id
 * @property {number} palette
 * @property {number[][]} tilemap
 * @property {number[][]} backmap
 * @property {number[][]} foremap
 * @property {number[][]} wallmap
 * @property {BipsiDataEvent[]} events
 */

/**
 * @typedef {Object} BipsiDataTile
 * @property {number} id
 * @property {number[]} frames
 */

/**
 * @typedef {Object} BipsiDataPalette
 * @property {number} id 
 * @property {string[]} colors
 */

/**
 * @typedef {Object} BipsiDataProject
 * @property {BipsiDataRoom[]} rooms
 * @property {BipsiDataPalette[]} palettes
 * @property {string} tileset
 * @property {BipsiDataTile[]} tiles
 */

/**
 * @typedef {Object} BipsiDataLocation 
 * @property {number} room
 * @property {number[]} position
 */

/**
 * Return a list of resource ids that a particular bipsi project depends on. 
 * @param {BipsiDataProject} data 
 * @returns {string[]}
 */
function getManifest(data) {
    // all embedded files
    const files = allEvents(data)
        .flatMap((event) => event.fields)
        .filter((field) => field.type === "file")
        .map((field) => field.data);

    // + tileset
    return [data.tileset, ...files];
}

// change these at your own risk
let TILE_PX = BIPSI_HD ? 16 : 8;
let ROOM_SIZE = 16;
let SCREEN_ZOOM = 2;

let ROOM_PX = TILE_PX * ROOM_SIZE;
let SCREEN_PX = ROOM_PX * SCREEN_ZOOM;

const constants = {
    frameInterval: 400,

    tileset: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAAAjUlEQVR42u3XMQ4AEBAEwPv/p2kUIo5ScmYqQWU3QsSkDbu5TFBHVoDTfqemAFQKfy3BOs7WKBT+HLQCfBB+dgPcHnoKULAIp7ECfFoA30AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOCFDjCu5xlD93/uAAAAAElFTkSuQmCC",

    wallTile: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAMAAAAoLQ9TAAAAAXNSR0IArs4c6QAAAAlQTFRFAAAA////AAAAc8aDcQAAAAN0Uk5TAP//RFDWIQAAADlJREFUGJVlj0EOACAIw2D/f7QmLAa7XeyaKFgVkfSjum1M9xhDeN24+pjdbVYPwSt8lGMDcnV+DjlaUACpjVBfxAAAAABJRU5ErkJggg==",
    eventTile: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAMAAAAoLQ9TAAAAAXNSR0IArs4c6QAAAAlQTFRFAAAA////AAAAc8aDcQAAAAN0Uk5TAP//RFDWIQAAACVJREFUGJVjYMAATCgAJMCIBCACCHmYAFz3AAugOwzd6eieQwMAdfAA3XvBXggAAAAASUVORK5CYII=",
    startTile: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAMAAAAoLQ9TAAAAAXNSR0IArs4c6QAAAAZQTFRFAAAA////pdmf3QAAAAJ0Uk5TAP9bkSK1AAAAJUlEQVQYlWNgwACMKAC7ALJqnALIqkEETD8lAhiGEnIHIb+gAQBFEACBGFbz9wAAAABJRU5ErkJggg==",
    pluginTile: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAQAAAC1+jfqAAAAAXNSR0IArs4c6QAAAFJJREFUKJGVkVEOwCAIQ4vp/a/MPkwUisOtXxBfaQTgIgPg3TvREAaAu1RNG3Ob3QmIUyI8dKxLoABVzK2VCAHqh/9EnNe1gNOqAvB+DnbuT3oAhXsLLn/W2IoAAAAASUVORK5CYII=",

    colorwheelMargin: 12,
}

const TEMP_ROOM = createRendering2D(ROOM_PX, ROOM_PX);
const TEMP_SCREEN = createRendering2D(SCREEN_PX, SCREEN_PX);

/**
 * @param {HTMLCanvasElement} tileset 
 * @param {number} index 
 */
function getTileCoords(tileset, index) {
    const cols = tileset.width / TILE_PX;

    return {
        x: TILE_PX * (index % cols),
        y: TILE_PX * Math.floor(index / cols),
        size: TILE_PX,
    }
}

/**
 * @param {CanvasRenderingContext2D} tileset 
 * @param {number} tileIndex 
 * @param {CanvasRenderingContext2D} destination 
 * @returns {CanvasRenderingContext2D}
 */
function copyTile(tileset, tileIndex, destination = undefined) {
    const { x, y, size } = getTileCoords(tileset.canvas, tileIndex);
    const tile = copyRendering2D(tileset, destination, { x, y, w: size, h: size });
    return tile;
}

/**
 * @param {CanvasRenderingContext2D} tileset 
 * @param {number} tileIndex
 * @param {CanvasRenderingContext2D} tile 
 */
function drawTile(tileset, tileIndex, tile) {
    const { x, y, size } = getTileCoords(tileset.canvas, tileIndex);
    tileset.clearRect(x, y, size, size);
    tileset.drawImage(tile.canvas, x, y);
}

/**
 * @param {BipsiDataTile[]} tiles 
 * @param {number} frame 
 * @returns {Map<number, number>} 
 */
function makeTileToFrameMap(tiles, frame) {
    /** @type {[number, number][]} */
    return new Map(tiles.map((tile) => [
        tile.id, 
        tile.frames[frame % tile.frames.length],
    ]));
}

/**
 * @param {CanvasRenderingContext2D} destination
 * @param {CanvasRenderingContext2D} tileset 
 * @param {Map<number, number>} tileToFrame 
 * @param {BipsiDataPalette} palette 
 * @param {{ tilemap: number[][], backmap: number[][], foremap: number[][] }} layer 
 */
function drawTilemapLayer(destination, tileset, tileToFrame, palette, { tilemap, backmap, foremap }) {
    drawRecolorLayer(destination, (backg, color, tiles) => {
        for (let ty = 0; ty < ROOM_SIZE; ++ty) {
            for (let tx = 0; tx < ROOM_SIZE; ++tx) {
                let back = backmap[ty][tx];
                let fore = foremap[ty][tx];
                let tileIndex = tilemap[ty][tx];
                
                if (tileIndex === 0) {
                    fore = back;
                    tileIndex = 1;
                }

                const frameIndex = tileToFrame.get(tileIndex);
                const { x, y, size } = getTileCoords(tileset.canvas, frameIndex);

                if (back > 0) {
                    backg.fillStyle = palette.colors[back];
                    backg.fillRect(tx * size, ty * size, size, size);
                }

                if (fore > 0) {
                    color.fillStyle = palette.colors[fore];
                    color.fillRect(tx * size, ty * size, size, size);
                }

                tiles.drawImage(
                    tileset.canvas,
                    x, y, size, size, 
                    tx * size, ty * size, size, size,
                );
            }
        }
    });
}

/**
 * @param {CanvasRenderingContext2D} destination 
 * @param {CanvasRenderingContext2D} tileset 
 * @param {Map<number, number>} tileToFrame 
 * @param {BipsiDataPalette} palette 
 * @param {BipsiDataEvent[]} events 
 */
function drawEventLayer(destination, tileset, tileToFrame, palette, events) {
    drawRecolorLayer(destination, (backg, color, tiles) => {
        events.forEach((event) => {
            const [tx, ty] = event.position;
            const graphicField = oneField(event, "graphic", "tile");
            if (graphicField) {
                let { fg, bg } = FIELD(event, "colors", "colors") ?? { bg: 1, fg: 3 };

                const frameIndex = tileToFrame.get(graphicField.data) ?? 0;
                const { x, y, size } = getTileCoords(tileset.canvas, frameIndex);
    
                if (eventIsTagged(event, "transparent")) {
                    bg = 0;
                }

                if (bg > 0) {
                    backg.fillStyle = palette.colors[bg];
                    backg.fillRect(tx * size, ty * size, size, size);
                }

                if (fg > 0) {
                    color.fillStyle = palette.colors[fg];
                    color.fillRect(tx * size, ty * size, size, size);
                }

                tiles.drawImage(
                    tileset.canvas,
                    x, y, size, size, 
                    tx * size, ty * size, size, size,
                );
            }
        });
    });
}

/**
 * @param {CanvasRenderingContext2D} rendering 
 * @param {BipsiDataPalette} palette 
 * @param {BipsiDataRoom} room 
 */
 function drawRoomThumbnail(rendering, palette, room) {
    rendering.canvas.width = ROOM_SIZE;
    rendering.canvas.height = ROOM_SIZE;

    const [, background, foreground, highlight] = palette.colors;
    for (let y = 0; y < ROOM_SIZE; ++y) {
        for (let x = 0; x < ROOM_SIZE; ++x) {
            const foreground = palette.colors[room.foremap[y][x]];
            const background = palette.colors[room.backmap[y][x]];

            const color = room.wallmap[y][x] === 1 ? foreground : background;
            rendering.fillStyle = color;
            rendering.fillRect(x, y, 1, 1);
        }
    }

    rendering.fillStyle = highlight;
    room.events.forEach((event) => {
        const [x, y] = event.position;
        rendering.fillRect(x, y, 1, 1);
    });
}

/**
 * @param {CanvasRenderingContext2D} rendering 
 * @param {BipsiDataPalette} palette
 */
function drawPaletteThumbnail(rendering, palette) {
    for (let y = 0; y < 2; ++y) {
        for (let x = 0; x < 4; ++x) {
            rendering.fillStyle = palette.colors[y * 4 + x];
            rendering.fillRect(x, y, 1, 1);
        }
    }
    rendering.clearRect(0, 0, 1, 1);
}


/**
 * @param {any[][]} map 
 * @param {number} dx 
 * @param {number} dy 
 */
function cycleMap(map, dx, dy) {
    const x = dx > 0 ? dx : ROOM_SIZE + dx;
    const y = dy > 0 ? dy : ROOM_SIZE + dy;
    
    map.push(...map.splice(0, y));
    map.forEach((row) => {
        row.push(...row.splice(0, x));
    });
}

/**
 * @param {BipsiDataEvent[]} events 
 * @param {number} dx
 * @param {number} dy 
 */
function cycleEvents(events, dx, dy) {
    events.forEach((event) => {
        event.position[0] = (event.position[0] + ROOM_SIZE + dx) % ROOM_SIZE;
        event.position[1] = (event.position[1] + ROOM_SIZE + dy) % ROOM_SIZE;
    });
}

/**
 * @param {BipsiDataEvent[]} events 
 * @param {number} x
 * @param {number} y 
 */
function getEventsAt(events, x, y, ignore=undefined) {
    return events.filter((event) => event.position[0] === x 
                                 && event.position[1] === y 
                                 && event !== ignore);
}

/**
 * @template {{id: number}} T
 * @param {T[]} items 
 * @param {number} id 
 * @returns {T}
 */
function getById(items, id) {
    return items.find((item) => item.id === id);
}

/** 
 * @param {BipsiDataProject} data 
 * @param {number} id
 * @returns {BipsiDataRoom}
 */
function getRoomById(data, id) {
    return getById(data.rooms, id);
}

/** 
 * @param {BipsiDataProject} data 
 * @param {number} id
 * @returns {BipsiDataPalette}
 */
function getPaletteById(data, id) {
    return getById(data.palettes, id);
}

/** 
 * @param {BipsiDataProject} data 
 * @param {number} id
 * @returns {BipsiDataEvent}
 */
function getEventById(data, id) {
    return getById(allEvents(data), id);
}

/** 
 * @param {BipsiDataProject} data 
 * @param {number} id
 * @returns {BipsiDataTile}
 */
function getTileById(data, id) {
    return getById(data.tiles, id);
}

/**
 * @param {BipsiDataTile[]} tiles
 */
function findFreeFrame(tiles) {
    const frames = new Set(tiles.flatMap((tile) => tile.frames));
    const max = Math.max(...frames);

    for (let i = 0; i < max; ++i) {
        if (!frames.has(i)) return i;
    }

    return max + 1;
}

/**
 * @param {{id: number}[]} items 
 * @returns {number}
 */
function nextId(items) {
    const max = Math.max(0, ...items.map((item) => item.id ?? 0));
    return max + 1;
}

/** @param {BipsiDataProject} data */
const nextRoomId = (data) => nextId(data.rooms);

/** @param {BipsiDataProject} data */
const nextTileId = (data) => nextId(data.tiles);

/** @param {BipsiDataProject} data */
const nextEventId = (data) => nextId(data.rooms.flatMap((room) => room.events));

/** @param {BipsiDataProject} data */
const nextPaletteId = (data) => nextId(data.palettes);

/**
 * @param {CanvasRenderingContext2D} tileset 
 * @param {BipsiDataTile[]} tiles
 */
function resizeTileset(tileset, tiles) {
    const maxFrame = Math.max(...tiles.flatMap((tile) => tile.frames));
    const cols = 16;
    const rows = Math.ceil((maxFrame + 1) / cols);
    resizeRendering2D(tileset, cols * TILE_PX, rows * TILE_PX);
}
