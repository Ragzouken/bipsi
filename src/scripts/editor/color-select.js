class ColorSelectItem {
    constructor(root, inputs) {
        this.root = root;
        this.inputs = inputs;
    }

    setup(id, colors) {
        this.inputs.forEach((input, i) => {
            input.title = `select palette ${id}, color ${i+1}`;
            input.value = `${id},${i+1}`;
            input.style.backgroundColor = colors[i+1];
        });
    }

    remove() {
        this.root.remove();
    }
}

class ColorSelect {
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
                const item = new ColorSelectItem(clone, ALL("input", clone));
                parent.append(clone);
                return item;
            },
            dispose: (item) => item.remove(), 
        });
    }

    /**
     * @param {BipsiDataPalette[]} palettes 
     */
    updatePalettes(palettes) {
        this.items.map(palettes, ({ id, colors }, item) => item.setup(id, colors));
        this.select.replaceInputs(ALL(`input[type="radio"][name="${this.name}"]`));
    }
}