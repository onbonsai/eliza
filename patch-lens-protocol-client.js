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
      filePath: './node_modules/@lens-protocol/client/dist/index.js',
      replacements: [
//         { // ResultAwareError, err, ok, never, okAsync, ResultAsync, errAsync, signatureFrom, invariant
//             searchValue: /import\s*\{\s*ResultAwareError,\s*err,\s*ok,\s*never,\s*okAsync,\s*ResultAsync,\s*errAsync,\s*signatureFrom,\s*invariant\s*\}\s*from\s*'@lens-protocol\/types';/g,
//             replaceValue: `import { ResultAwareError, err, ok, never, okAsync, ResultAsync, errAsync, signatureFrom, invariant } from '@lens-protocol/types/dist/index';`,
//         },
//         {
//           searchValue: /export\s*\*\s*from\s*'@lens-protocol\/types';/g,
//           replaceValue: `export * from '@lens-protocol/types/dist/index';`,
//         },
//         {
//           searchValue: /import\s*\{\s*getLogger\s*\}\s*from\s*'loglevel';/g,
//           replaceValue: `
// import Module from "node:module";

// const require = Module.createRequire(import.meta.url);
// const { getLogger } = require('loglevel');`,
//         },
        { // import { getLogger } from 'loglevel';
            searchValue: /import\s*\{\s*getLogger\s*\}\s*from\s*'loglevel';/g,
            replaceValue: `import pkg from 'loglevel';const { getLogger } = pkg;`,
        },
      ],
    },

    // // Patch for @lens-protocol/env/dist/index.js
    // {
    //   filePath: './node_modules/@lens-protocol/env/dist/index.js',
    //   replacements: [
    //     {
    //       searchValue: /import\s*\{\s*url\s+as\s+n,\s*never\s+as\s*e\s*\}\s*from\s*["@']@lens-protocol\/types["@'];/g,
    //       replaceValue: `import{url as n,never as e}from"@lens-protocol/types/dist/index";`,
    //     },
    //   ],
    // },

    // // Patch for @lens-protocol/storage/dist/index.js
    // {
    //   filePath: './node_modules/@lens-protocol/storage/dist/index.js',
    //   replacements: [
    //     {
    //       searchValue: /import\s*\{\s*assertError\s+as\s+d,\s*invariant\s+as\s+I\s*\}\s*from\s*["@']@lens-protocol\/types["@'];/g,
    //       replaceValue: `import{assertError as d,invariant as I}from"@lens-protocol/types/dist/index";`,
    //     },
    //     {
    //       searchValue: /import\s*\{\s*accessToken\s+as\s+h,\s*idToken\s+as\s+l,\s*refreshToken\s+as\s+v\s*\}\s*from\s*["@']@lens-protocol\/types["@'];/g,
    //       replaceValue: `import{accessToken as h,idToken as l,refreshToken as v}from"@lens-protocol/types/dist/index";`,
    //     },
    //   ],
    // },
    // // Patch for @lens-protocol/graph/dist/index.js
    // {
    //   filePath: './node_modules/@lens-protocol/graphql/dist/index.js',
    //   replacements: [
    //     {
    //       searchValue: /import\s*\{\s*InvariantError\s*\}\s*from\s*["@']@lens-protocol\/types["@'];/g,
    //       replaceValue: `import {InvariantError}from'@lens-protocol/types/dist/index';`,
    //     },
    //   ],
    // },
    // // Patch for @lens-protocol/client/dist/viem/index.js
    // {
    //   filePath: './node_modules/@lens-protocol/client/dist/viem/index.js',
    //   replacements: [
    //     { // import { okAsync, errAsync, ResultAwareError, ResultAsync, txHash, invariant } from '@lens-protocol/types'
    //         searchValue: /import\s*\{\s*okAsync,\s*errAsync,\s*ResultAwareError,\s*ResultAsync,\s*txHash,\s*invariant\s*\}\s*from\s*'@lens-protocol\/types';/g,
    //         replaceValue: `import { okAsync, errAsync, ResultAwareError, ResultAsync, txHash, invariant } from '@lens-protocol/types/dist/index';`,
    //     },
    //   ],
    // },
  ];

  // Apply patches
  patches.forEach(({ filePath, replacements }) => {
    patchFile(filePath, replacements);
  });
};

// Run the script
main();