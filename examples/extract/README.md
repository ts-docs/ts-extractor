
# Example - extract the types of a lib

Let's get all the type information from a typescript library. 

1. First, download this folder and install all dependencies (`npm i`)
2. Clone a typescript library of your liking, maybe even this one! Make sure to clone it in this directory.
3. Go to `src/index.ts` and replace "pathToEntryPoint" with the entry point of the typescript library. If you decided to clone this one, the path would be `./ts-extractor/src/index.ts`
4. Transpile and run the code: `npm run run`
5. You should see an `output.json` file in this directory. Open it and you'll see all the types!
