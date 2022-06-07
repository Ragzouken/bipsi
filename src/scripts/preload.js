async function preload() {
    const canvas = ONE("#player-canvas");
    const rendering = canvas.getContext("2d");
    rendering.drawImage(ONE("#loading-splash"), 0, 0);
    scaleElementToParent(canvas.parentElement);
}
