class StoryEditor {
    /**
     * @param {BipsiEditor} editor 
     */
    constructor(editor) {
        this.editor = editor;
        this.inkEditor = ONE("#field-story-editor textarea");
        this.inkPlayerContainer = ONE("#story-container");

        this.inkEditor.value = "Loading or source unavailable";
        this.inkEditor.setAttribute("disabled", "disabled");
        this.story = null;

        this.choiceHistory = [];

        this.inkEditor.addEventListener("input", () => {
            editor.inkSource = this.inkEditor.value;
            this.compile()

            if(this.story){
                this.playtest(this.choiceHistory)
            }
        })
    }

    loadSource(inkSource){
        this.inkEditor.value = inkSource;
        this.inkEditor.removeAttribute("disabled");
        this.compile();
    }

    compile(){

        const errors = []
        const errorHandler = (message, type) =>{
            var issueRegex = /^(ERROR|WARNING|RUNTIME ERROR|RUNTIME WARNING|TODO): ('([^']+)' )?line (\d+): (.*)/;
            let issueMatches = message.match(issueRegex);
    
            if(issueMatches){
                errors.push(message)
            }
        }
        const compilerOptions = new inkjs.CompilerOptions(null,[],false, errorHandler);

        try{
            this.editor.logTextElement.replaceChildren("> RESTARTING COMPILATION\n");
            this.story = new inkjs.Compiler(this.inkEditor.value, compilerOptions).Compile();
            window.postMessage({ type: "log", data: "> COMPILATION SUCCESSFUL" })

            const jsonBytecode = this.story.ToJson();
            ONE("#story-embed").innerHTML = jsonBytecode;
            
        }catch(e){
            errors.forEach((message) => {
                console.error(message);
                window.postMessage({ type: "log", data: message })
            })
            this.editor.logWindow.hidden = false;
            this.editor.showLog.checked = true;
        }
    }

    reset(){
        this.choiceHistory = [];
        if(!this.story) return;
        this.story.ResetState();
        
    }

    playtest(withChoices){
        if(!this.story) return;
        if(withChoices === undefined){
            withChoices = [];
        }

        const story = this.story;
        this.inkPlayerContainer.innerHTML = "";
        story.ResetState();
        this.continueStory(story, withChoices);
    }

    undo(){
        if(!this.story) return;
        const story = this.story;
        this.choiceHistory.pop();
        
        this.inkPlayerContainer.innerHTML = "";
        story.ResetState();
        this.continueStory(story, this.choiceHistory);
    }

    continueStory(story, withChoices){
        const self = this;

        while(story.canContinue) {
            var paragraphText = story.Continue();
            var paragraphElement = document.createElement('p');
            paragraphElement.innerHTML = paragraphText;
            self.inkPlayerContainer.appendChild(paragraphElement);
        }

        if(withChoices && withChoices.length > 0){
            const choice = withChoices[0];
            story.ChooseChoiceIndex(choice);
            return this.continueStory(story, withChoices.slice(1));
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
                self.choiceHistory.push(choice.index)

                // Aaand loop
                self.continueStory(story);
            });
        });
        self.inkPlayerContainer.scrollTop = self.inkPlayerContainer.scrollHeight;
    }
}
