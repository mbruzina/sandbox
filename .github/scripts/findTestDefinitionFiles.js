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
    // const definitionsDir = "${{ github.workspace }}/oil/test/definitions";
    const definitionsDir = "/home/runner/work/sandbox/sandbox/oil/test/definitions/infra-agent";
    // const abbrevDir = "/test/definitions/infra-agent"
    const abbrevDir = process.argv[2];
    const testDefinitions = await getFiles(definitionsDir);

    const outputTestFilesMap = testDefinitions
        .map((testDefinitionFile) => {
            return {
                testDefinitionFile,
                testDisplayName: testDefinitionFile.replace(`${definitionsDir}/`, ""),
                testDefinitionSuffix: testDefinitionFile.replace(`${definitionsDir}/`, `${abbrevDir}/`)
            };
        });

    const output = {
        include: outputTestFilesMap,
    };
    console.log(JSON.stringify(output));
    // return output;
}


if (require.main === module) {
    main();
}