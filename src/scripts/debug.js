/**
 * @param {CanvasRenderingContext2D} destination 
 * @param {CanvasRenderingContext2D} tileset 
 * @param {Map<number, number>} tileToFrame 
 * @param {string[]} palette 
 * @param {BipsiDataRoom} room
 */
 function drawRoomPreview(destination, tileset, tileToFrame, palette, room) {
    const [background] = palette;

    fillRendering2D(destination, background);
    drawTilemapLayer(destination, tileset, tileToFrame, palette, room);
    drawEventLayer(destination, tileset, tileToFrame, palette, room.events);
}

/**
 * @param {CanvasRenderingContext2D} destination 
 * @param {BipsiPlayback} playback 
 * @param {number} roomId 
 */
function drawRoomPreviewPlayback(destination, playback, roomId) {
    const tileset = playback.stateManager.resources.get(playback.data.tileset);
    const room = getRoomById(playback.data, roomId);
    const palette = playback.data.palettes[room.palette];
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
    const palette = playback.data.palettes[room.palette];
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

        playback.render();
        frames.push([playback.rendering.canvas.toDataURL(), 400]);
        playback.update(.4);
        playback.render();
        frames.push([playback.rendering.canvas.toDataURL(), 400]);
        
        return frames;
}
