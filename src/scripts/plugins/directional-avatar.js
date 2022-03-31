function TURN_EVENT(event, direction) {
    const tile = FIELD(event, "graphic-" + direction, "tile");
    if (tile) {
        replaceFields(event, "graphic", "tile", tile);
    }
}

wrap.before(BipsiPlayback.prototype, "move", function (dx, dy) {
    const avatar = getEventById(this.data, this.avatarId);

    if (dx > 0) {
        TURN_EVENT(avatar, "right")
    } else if (dx < 0) {
        TURN_EVENT(avatar, "left")
    } else if (dy < 0) {
        TURN_EVENT(avatar, "up")
    } else if (dy > 0) {
        TURN_EVENT(avatar, "down")
    }
});