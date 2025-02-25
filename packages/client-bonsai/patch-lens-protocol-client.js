// https://github.com/elizaOS/eliza/commit/6270bc1fed4ee9f8173307ad05fa20e73cac4b87

import fs from "node:fs";
import path from "node:path";

// Helper function to patch a file
const patchFile = (filePath, replacements) => {
  const fullPath = path.resolve(filePath);

  if (!fs.existsSync(fullPath)) {
    console.error(`Error: File not found at ${fullPath}`);
    process.exit(1);
  }

  // Read the file content
  let fileContent = fs.readFileSync(fullPath, 'utf8');

  // Apply each replacement
  replacements.forEach(({ searchValue, replaceValue }) => {
    if (fileContent.includes(replaceValue)) {
      console.log(`Already patched: ${fullPath}`);
      return;
    }
    fileContent = fileContent.replace(searchValue, replaceValue);
  });

  // Write the updated content back to the file
  fs.writeFileSync(fullPath, fileContent, 'utf8');
  console.log(`Patched file successfully: ${fullPath}`);
};

// Main function to handle all patches
const main = () => {
  const patches = [
    // Patch for @lens-protocol/client/dist/index.js
    {
      filePath: './../../node_modules/@lens-protocol/client/dist/index.js',
      replacements: [
        { // import { getLogger } from 'loglevel';
            searchValue: /import\s*\{\s*getLogger\s*\}\s*from\s*'loglevel';/g,
            replaceValue: `import pkg from 'loglevel';const { getLogger } = pkg;`,
        },
      ],
    },
  ];

  // Apply patches
  patches.forEach(({ filePath, replacements }) => {
    patchFile(filePath, replacements);
  });
};

// Run the script
main();