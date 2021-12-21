# Development pipeline

## Graphics

* Connect [to the online editor](https://smwhr.github.io/binksi/editor)
* Export JSON
* Save in `data/bipsi.json`
* Review your changes, commit and push
* Github action should run and update the editor online


### What happens behind the scene

* When you export to JSON, it exports as a pretty-formatted JSON file that is easily shared
* The editor is actually rebuilt with this file as default data

## Narration / ink

* Retrieve the latest ink files from `data/story.ink`
* Modify using inky or your favorite editor
* Review your changes, commit and push
* Github action should run and compile the story in `data/story.ink.json`


## Overall

* The full game is compiled in the branch `distribution` and can be [played online](https://smwhr.github.io/binksi/play)