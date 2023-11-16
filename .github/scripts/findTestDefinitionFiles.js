const fs = require("fs");
const fsp = fs.promises;
const path = require("path");

// readdir recursive directory search
const {readdir} = fsp;

async function getFiles(dir) {
    const dirents = await readdir(dir, {withFileTypes: true});
    const files = await Promise.all(
        dirents.map((dirent) => {
            const res = path.join(dir, dirent.name);
            return dirent.isDirectory() ? getFiles(res) : res;
        })
    );
    return Array.prototype.concat(...files);
}


async function main() {
    const definitionsDir = "${{ github.workspace }}/open-install-library/test/definitions";
    const testDefinitions = await getFiles(definitionsDir);

    const outputTestFilesMap = testDefinitions
        .map((testDefinitionFile) => {
            return {
                testDefinitionFile,
                testDisplayName: testDefinitionFile.replace(`${definitionsDir}/`, ""),
            };
        });

    const output = {
        include: outputTestFilesMap,
    };
    console.log(output);
    return output;
}


if (require.main === module) {
    main();
}