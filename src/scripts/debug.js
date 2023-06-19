/**
 * @param {CanvasRenderingContext2D} destination 
 * @param {CanvasRenderingContext2D} tileset 
 * @param {Map<number, number>} tileToFrame 
 * @param {BipsiDataPalette} palette 
 * @param {BipsiDataRoom} room
 */
 function drawRoomPreview(destination, tileset, tileToFrame, palette, room) {
    const [background] = palette.colors;

    fillRendering2D(destination, background);
    drawTilemapLayer(destination, tileset, tileToFrame, palette, room);
    drawEventLayer(destination, tileset, tileToFrame, palette, room.events);

    room.events.forEach((event) => {
        const [x, y] = event.position;

        destination.fillStyle = "white";
        destination.globalAlpha = .5;
        destination.fillRect(
            x * TILE_PX + 1, 
            y * TILE_PX + 1, 
            TILE_PX - 2, 
            TILE_PX - 2,
        );
    });
    destination.globalAlpha = 1;
}

/**
 * @param {CanvasRenderingContext2D} destination 
 * @param {BipsiPlayback} playback 
 * @param {number} roomId 
 */
function drawRoomPreviewPlayback(destination, playback, roomId) {
    const tileset = playback.stateManager.resources.get(playback.data.tileset);
    const room = getRoomById(playback.data, roomId);
    const palette = getPaletteById(playback.data, room.palette);
    const tileToFrame = makeTileToFrameMap(playback.data.tiles, 0);
    drawRoomPreview(destination, tileset, tileToFrame, palette, room);
}

/**
 * @param {CanvasRenderingContext2D} destination 
 * @param {BipsiPlayback} playback 
 * @param {number} roomId 
 */
 function drawRoomThumbPlayback(destination, playback, roomId) {
    const room = getRoomById(playback.data, roomId);
    const palette = getPaletteById(playback.data, room.palette);
    drawRoomThumbnail(destination, palette, room);
}

async function generateRoomPreviewURL(destination, playback, roomId) {
    drawRoomPreviewPlayback(destination, playback, roomId);
    URL.createObjectURL(await canvasToBlob(destination.canvas));
}

/**
 * @param {BipsiPlayback} playback
 * @returns {Promise<[string, number][]>}
 */
async function recordFrames(playback) {
    const frames = [];
    const temp = createRendering2D(512, 512);

    await playback.render(0);
    temp.drawImage(playback.rendering.canvas, 0, 0, 512, 512);
    frames.push([temp.canvas.toDataURL(), Math.floor(playback.frameDelay * 1000)]);
    await playback.render(1);
    temp.drawImage(playback.rendering.canvas, 0, 0, 512, 512);
    frames.push([temp.canvas.toDataURL(), Math.floor(playback.frameDelay * 1000)]);

    return frames;
}
