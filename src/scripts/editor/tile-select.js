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
    }

    get selectedTileIndex() {
        return this.select.valueAsNumber;
    }

    set selectedTileIndex(value) {
        this.select.setValueSilent(value);
        //this.select.inputs[this.select.selectedIndex]?.scrollIntoView({ block: "nearest" });
    }

    setFrame(frame) {
        this.frame = frame;
        this.updateCSS();
        this.redraw();
    }

    redraw() {
        if (this.selectedTileIndex === -1) {
            this.selectedTileIndex = 0;
        }

        const { data, tile } = this.editor.getSelections();

        this.items.setCount(data.tiles.length);

        this.editor.tileEditor.animateToggle.setCheckedSilent(tile?.frames.length > 1);

        this.editor.actions.duplicateTile.disabled = !tile;
        this.editor.actions.reorderTileBefore.disabled = !tile || this.selectedTileIndex <= 0;
        this.editor.actions.reorderTileAfter.disabled = !tile || this.selectedTileIndex >= data.tiles.length - 1;
        this.editor.actions.deleteTile.disabled = this.selectedTileIndex === -1 || data.tiles.length === 1;
    }

    async setURIs(uris, canvases) {
        this.thumbnailURIs = uris;
        this.updateCSS();

        const root = ONE(":root");
        const w = canvases[0].width * TILE_SELECT_ZOOM;
        const h = canvases[0].height * TILE_SELECT_ZOOM;

        const { data } = this.editor.getSelections();

        root.style.setProperty("--tileset-background-size", `${w}px ${h}px`);

        this.items.map(data.tiles, (tile, item, index) => {
            const { x, y } = getTileCoords(canvases[0], index);
            item.setup(tile.id, x * TILE_SELECT_ZOOM, y * TILE_SELECT_ZOOM, index);
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
