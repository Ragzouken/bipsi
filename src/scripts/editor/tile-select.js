class TileSelectItem {
    constructor(root, input) {
        this.root = root;
        this.input = input;
    }

    setup(id, x, y, index) {
        this.input.title = `select tile ${id}`;
        this.input.value = index;
        this.root.style.backgroundPosition = `-${x}px -${y}px`;
    }

    remove() {
        this.root.remove();
    }
}

class TileBrowser {
    /**
     * @param {BipsiEditor} editor
     * @param {string} name
     * @param {HTMLTemplateElement} template
     */
    constructor(editor, name, template) {
        this.editor = editor;
        this.template = template;

        this.thumbnailURIs = [];

        this.itemContainer = this.template.parentElement;

        this.items = new IndexedItemPool({
            create: () => {
                const clone = this.template.content.firstElementChild.cloneNode(true);
                const item = new TileSelectItem(clone, ONE("input", clone));
                this.itemContainer.append(item.root);
                this.select.add(item.input);
                return item;
            },
            dispose: (item) => {
                this.select.remove(item.input);
                item.remove();
            },
        });

        this.select = ui.radio(name);
    
        this.select.addEventListener("change", () => this.redraw());

        this.frame = 0;

        window.setInterval(() => {
            if (!this.editor.ready) return;
            this.frame = 1 - this.frame;
            this.updateCSS();
            this.redraw();
        }, constants.frameInterval);
    }

    get selectedTileIndex() {
        return this.select.valueAsNumber;
    }

    set selectedTileIndex(value) { 
        this.select.setValueSilent(value);
        this.select.inputs[this.select.selectedIndex]?.scrollIntoView({ block: "center" }); 
    }

    redraw() {
        const { data, tile } = this.editor.getSelections();
        if (!tile) return;

        this.items.setCount(data.tiles.length);
        if (this.select.selectedIndex === -1) {
            this.select.selectedIndex = 0;
        }

        this.editor.tileEditor.animateToggle.setCheckedSilent(tile.frames.length > 1);

        this.editor.actions.reorderTileBefore.disabled = this.selectedTileIndex <= 0;
        this.editor.actions.reorderTileAfter.disabled = this.selectedTileIndex >= data.tiles.length - 1;
    }

    async setFrames(canvases) {
        const prev = [...this.thumbnailURIs];
        const blobs = await Promise.all(canvases.map(canvasToBlob));
        const uris = blobs.map(URL.createObjectURL);
        await Promise.all(uris.map(loadImage)).then(() => {
            this.thumbnailURIs = uris;
            this.updateCSS();
            prev.map(URL.revokeObjectURL);
        });

        const root = ONE(":root");
        const scale = 5;
        const w = canvases[0].width * scale;
        const h = canvases[0].height * scale;

        const { data, room } = this.editor.getSelections();

        root.style.setProperty("--tileset-background-size", `${w}px ${h}px`);
        root.style.setProperty("--tileset-background-color", data.palettes[room.palette][0]);

        this.items.map(data.tiles, (tile, item, index) => {
            const { x, y } = getTileCoords(canvases[0], index);
            item.setup(tile.id, x * scale, y * scale, index);
        });
    }

    async updateCSS() {
        this.itemContainer.style.setProperty(
            "--tileset-background-image", 
            `url("${this.thumbnailURIs[this.frame]}")`,
        );
    }
}

class EventTileBrowser extends TileBrowser {
    redraw() {
    }
}
