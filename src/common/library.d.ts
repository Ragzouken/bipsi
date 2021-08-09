export {}

declare global {    
    interface HTMLElement {
        replaceChildren(...nodes: (Node | string)[]): void;
    }
}
