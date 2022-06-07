class StoryEditor {
    /**
     * @param {BipsiEditor} editor 
     */
    constructor(editor) {
        this.editor = editor;
        this.inkEditor = ONE("#field-story-editor textarea");
        this.inkPlayerContainer = ONE("#story-container");

        this.inkEditor.value = editor.inkSource;
        this.story = null;

        this.compile();

        this.inkEditor.addEventListener("input", () => {
            this.compile()

            if(this.story){
                const jsonBytecode = this.story.ToJson();
                ONE("#story-embed").innerHTML = jsonBytecode;
                this.playtest()
            }
        })
    }

    compile(){
        try{
            this.story = new inkjs.Compiler(this.inkEditor.value).Compile();
        }catch(e){
            console.error(e)
        }
    }

    playtest(){
        if(!this.story) return;
        const story = this.story;
        this.inkPlayerContainer.innerHTML = "";
        story.ResetState();
        this.continueStory(story);

    }

    continueStory(story){
        const self = this;
        while(story.canContinue) {
            var paragraphText = story.Continue();
            var paragraphElement = document.createElement('p');
            paragraphElement.innerHTML = paragraphText;
            self.inkPlayerContainer.appendChild(paragraphElement);
        }

        story.currentChoices.forEach(function(choice) {
            var choiceParagraphElement = document.createElement('p');
            choiceParagraphElement.classList.add("choice");
            choiceParagraphElement.innerHTML = `<a href='#'>${choice.text}</a>`
            self.inkPlayerContainer.appendChild(choiceParagraphElement);

            var choiceAnchorEl = choiceParagraphElement.querySelectorAll("a")[0];
            choiceAnchorEl.addEventListener("click", function(event) {

                // Don't follow <a> link
                event.preventDefault();

                // Remove all existing choices
                const allElements = ALL(".choice", self.inkPlayerContainer)
                
                for(var i=0; i<allElements.length; i++) {
                    var el = allElements[i];
                    el.parentNode.removeChild(el);
                };

                // Tell the story where to go next
                story.ChooseChoiceIndex(choice.index);

                // Aaand loop
                self.continueStory(story);
            });
        });
        self.inkPlayerContainer.scrollTop = self.inkPlayerContainer.scrollHeight;
    }
}
