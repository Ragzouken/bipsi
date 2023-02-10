function debounce(func, wait, immediate) {
    var timeout;
  
    return function executedFunction() {
      var context = this;
      var args = arguments;
          
      var later = function() {
        timeout = null;
        if (!immediate) func.apply(context, args);
      };
  
      var callNow = immediate && !timeout;
      
      clearTimeout(timeout);
  
      timeout = setTimeout(later, wait);
      
      if (callNow) func.apply(context, args);
    };
  };

class StoryEditor {
    /**
     * @param {BipsiEditor} editor 
     */
    constructor(editor) {
        this.editor = editor;
        this.inkPlayerContainer = ONE("#story-container");

        this.inkEditor = ace.edit("field-story-editor");
        this.inkEditor.setTheme("ace/theme/monokai");
        this.inkEditor.session.setMode("ace/mode/ink");
        this.inkEditor.session.setUseWrapMode(true);
        
        this.inkEditor.setReadOnly(true);

        this.inkEditor.setValue("Loading or source unavailable");
        this.story = null;

        this.choiceHistory = [];

        const self = this;

        var compile = debounce(function() {
            editor.inkSource = self.inkEditor.getValue();
            self.compile()

            if(self.story){
                self.playtest(self.choiceHistory)
            }
        }, 100);

        this.inkEditor.session.on('change', function(delta) {
            compile()
        });
    }

    loadSource(inkSource){
        this.inkEditor.setValue(inkSource, -1);
        this.inkEditor.setReadOnly(false);
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
            this.story = new inkjs.Compiler(this.inkEditor.getValue(), compilerOptions).Compile();
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
        this.playtest();
    }

    playtest(withChoices){
        if(!this.story) return;
        if(withChoices === undefined){
            withChoices = [];
        }

        const story = this.story;
        this.inkPlayerContainer.innerHTML = "";
        story.ResetState();
        if(story.globalTags){
            this.inkPlayerContainer.innerHTML += story.globalTags.map(t => `<span class="tag>#${t}</span>`).join()
        }
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
            
            var tags = story.currentTags;
            if(tags){
                tags.forEach(t => {
                    var tagElement = document.createElement('span');
                    tagElement.innerHTML = `# ${t}`
                    tagElement.className = "tag"
                    paragraphElement.appendChild(tagElement)
                });
            }
            
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
            const choiceA = `<a href='#'>${choice.text}</a>`;
            const choiceTags = choice.tags && choice.tags.length ? `<span class="tag"> # ${choice.tags.join(", ")}</span>` : '';
            choiceParagraphElement.innerHTML = choiceA + choiceTags;
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
