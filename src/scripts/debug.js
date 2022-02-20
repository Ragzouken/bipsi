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
            x * 8 + 1, y * 8 + 1, 
            6, 6,
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
 * @returns {[string, number][]}
 */
function recordFrames(playback) {
    const frames = [];
    const temp = createRendering2D(512, 512);

    playback.update(.4);
    temp.drawImage(playback.rendering.canvas, 0, 0, 512, 512);
    frames.push([temp.canvas.toDataURL(), 400]);
    playback.update(.4);
    temp.drawImage(playback.rendering.canvas, 0, 0, 512, 512);
    frames.push([temp.canvas.toDataURL(), 400]);
    
    return frames;
}
