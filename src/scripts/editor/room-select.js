class RoomSelectItem {
    constructor(root, input, canvas) {
        this.root = root;
        this.input = input;
        this.canvas = canvas;
        this.rendering = canvas.getContext("2d");
    }

    setup(id, thumb) {
        this.input.value = id;
        this.rendering.drawImage(thumb, 0, 0);
    }

    remove() {
        this.root.remove();
    }
}

class RoomSelect {
    constructor(name, template) {
        /** @type {HTMLTemplateElement} */
        this.template = template;
        this.items = [];

        this.name = name;
        this.select = ui.radio(name);
    }

    updateRoomCount(count) {
        const missing = count - this.items.length;

        if (missing < 0) {
            const excess = this.items.splice(missing, -missing);
            excess.forEach((element) => element.remove());
        } else if (missing > 0) {
            const parent = this.template.parentElement;

            for (let i = 0; i < missing; ++i) {    
                const clone = this.template.content.firstElementChild.cloneNode(true);
                const item = new RoomSelectItem(clone, ONE("input", clone), ONE("canvas", clone));

                parent.append(clone);
                this.items.push(item);
            }
        }

        this.select.replaceInputs(ALL(`input[type="radio"][name="${this.name}"]`));
    }

    /**
     * @param {{ id: number, thumb: HTMLCanvasElement }[]} rooms 
     */
    updateRooms(rooms) {
        this.updateRoomCount(rooms.length);
        rooms.forEach(({ id, thumb }, i) => this.items[i].setup(id, thumb));
    }
}