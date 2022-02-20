async function preload() {
    const splash = await loadImage("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAAEABAMAAACuXLVVAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAGUExURQAAAP/YAFIewjUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAACXSURBVHja7dJBCgMhDEDReIN4/8sOkba4mEULogN9DxcusvhEAwAAAAAAAAAAAAAAAABmfRMBAgQ8PCA/czndDwX0QwHRxonaQdT85oCx+szXra1/iW8CIs4G5LSBeoJ6iHF2BLw/QP2BVgG1kI0BN/Otr/VrwHICBAgQIECAAAECBAh4bgAAAAAAAAAAAAAAAAAAfyjiAkM9EgGHYOwCAAAAAElFTkSuQmCC"); 
    const canvas = ONE("#player-canvas");
    const rendering = canvas.getContext("2d");
    rendering.drawImage(splash, 0, 0);
    scaleElementToParent(canvas.parentElement);
}
