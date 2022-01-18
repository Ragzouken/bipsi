class PaletteSelectItem {
    constructor(root, input, canvas) {
        this.root = root;
        this.input = input;
        this.canvas = canvas;
        this.rendering = canvas.getContext("2d");
    }

    setup(id, thumb) {
        this.input.title = `select palette ${id}`;
        this.input.value = id;
        this.rendering.drawImage(thumb, 0, 0);
    }

    remove() {
        this.root.remove();
    }
}

class PaletteSelect {
    /**
     * @param {*} name 
     * @param {HTMLTemplateElement} template 
     */
    constructor(name, template) {
        this.template = template;

        this.name = name;
        this.select = ui.radio(name);

        const parent = this.template.parentElement;

        this.items = new IndexedItemPool({
            create: () => {
                const clone = this.template.content.firstElementChild.cloneNode(true);
                const item = new PaletteSelectItem(clone, ONE("input", clone), ONE("canvas", clone));
                parent.append(clone);
                return item;
            },
            dispose: (item) => item.remove(), 
        });
    }

    /**
     * @param {{ id: number, thumb: HTMLCanvasElement }[]} palettes 
     */
    updatePalettes(palettes) {
        this.items.map(palettes, ({ id, thumb }, item) => item.setup(id, thumb));
        this.select.replaceInputs(ALL(`input[type="radio"][name="${this.name}"]`));
    }
}