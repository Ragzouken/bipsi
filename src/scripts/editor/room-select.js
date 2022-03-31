class RoomSelectItem {
    constructor(root, input, canvas) {
        this.root = root;
        this.input = input;
        this.canvas = canvas;
        this.rendering = canvas.getContext("2d");
        
        this.canvas.width = ROOM_SIZE;
        this.canvas.height = ROOM_SIZE;
    }

    setup(id, thumb) {
        this.input.title = `select room ${id}`;
        this.input.value = id;
        this.rendering.drawImage(thumb, 0, 0);
    }

    remove() {
        this.root.remove();
    }
}

class RoomSelect {
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
                const item = new RoomSelectItem(clone, ONE("input", clone), ONE("canvas", clone));
                parent.append(clone);
                return item;
            },
            dispose: (item) => item.remove(), 
        });
    }

    /**
     * @param {{ id: number, thumb: HTMLCanvasElement }[]} rooms 
     */
    updateRooms(rooms) {
        this.items.map(rooms, ({ id, thumb }, item) => item.setup(id, thumb));
        this.select.replaceInputs(ALL(`input[type="radio"][name="${this.name}"]`));
    }
}